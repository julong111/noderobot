import yaml
import csv
import requests
import subprocess
import time
import os
import signal
import sys
import concurrent.futures
import argparse
from urllib.parse import urlparse

# ================= 配置区域 =================
# 1. 文件路径
# 获取当前脚本所在目录，确保无论在哪里运行脚本都能找到文件
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

KERNEL_PATH = os.path.join(PROJECT_ROOT, "bin", "mihomo-darwin-amd64-v3-v1.19.19")
SOURCE_YAML = os.path.join(PROJECT_ROOT, "s/merge.yml")
TEMP_CONFIG = os.path.join(PROJECT_ROOT, "s/node-connective-temp-config.yaml")
CSV_DB_PATH = os.path.join(PROJECT_ROOT, "s/node-connective.csv")
CONFIG_DIR = os.path.join(PROJECT_ROOT, "config")

# 2. 隔离环境端口 (确保不和 Clash Party 冲突)
TEST_HTTP_PORT = 17890
TEST_SOCKS_PORT = 17891
TEST_CONTROLLER_PORT = 19090
TEST_SECRET = "test_secret_123"

# 3. 测试参数
TEST_URL = "http://www.gstatic.com/generate_204"
TIMEOUT_MS = 2000
CONCURRENCY = 32
# ===========================================

def generate_test_config(url=None):
    """读取原始订阅，生成一个只用于测试的临时配置"""
    config = None
    if url:
        print(f"正在从 URL 下载配置: {url}")
        try:
            resp = requests.get(url, timeout=30)
            resp.raise_for_status()
            config = yaml.safe_load(resp.text)
        except Exception as e:
            print(f"下载或解析 URL 失败: {e}")
            sys.exit(1)
    else:
        if not os.path.exists(SOURCE_YAML):
            print(f"错误: 找不到源文件 {SOURCE_YAML}")
            sys.exit(1)

        with open(SOURCE_YAML, 'r', encoding='utf-8') as f:
            try:
                config = yaml.safe_load(f)
            except Exception as e:
                print(f"解析 YAML 失败: {e}")
                sys.exit(1)

    # 强制覆盖关键设置，确保不影响宿主机
    config['port'] = TEST_HTTP_PORT
    config['socks-port'] = TEST_SOCKS_PORT
    config['mixed-port'] = TEST_HTTP_PORT # 某些旧版本可能需要
    config['external-controller'] = f"127.0.0.1:{TEST_CONTROLLER_PORT}"
    config['secret'] = TEST_SECRET
    
    # 关闭干扰项
    config['tun'] = {'enable': False}
    config['system-proxy'] = False # 绝对不要开启系统代理
    config['dns'] = {'enable': True, 'listen': '0.0.0.0:1053'} # 防止DNS端口冲突
    config['geo-auto-update'] = False # 禁止自动更新数据库，由用户手工下载
    
    # 确保 proxies 存在
    if 'proxies' not in config:
        print("错误: 订阅文件中没有找到 'proxies' 列表")
        sys.exit(1)

    # 写入临时文件
    with open(TEMP_CONFIG, 'w', encoding='utf-8') as f:
        yaml.dump(config, f, allow_unicode=True)
    
    return config['proxies']

def start_kernel():
    """启动 Mihomo 内核子进程"""
    # 检查数据库文件是否存在 (因为已设置为不自动下载)
    for db_file in ["Country.mmdb", "GeoSite.dat"]:
        db_path = os.path.join(CONFIG_DIR, db_file)
        if not os.path.exists(db_path):
            print(f"警告: 未在 {CONFIG_DIR} 找到 {db_file}，内核启动可能会失败。")

    print(f"正在启动测试内核 (端口: {TEST_CONTROLLER_PORT})...")
    # -d 指定工作目录(用于存放/读取 GeoIP/GeoSite 数据库)，-f 指定配置文件
    cmd = [KERNEL_PATH, "-d", CONFIG_DIR, "-f", TEMP_CONFIG]
    
    try:
        # 使用 subprocess.Popen 启动，不阻塞主线程
        # stdout/stderr 可以重定向到 DEVNULL 以保持控制台整洁，或者保留用于调试
        # 为了调试启动失败的问题，这里暂时移除 stdout/stderr 的屏蔽，让日志直接输出到终端
        process = subprocess.Popen(cmd)
        return process
    except FileNotFoundError:
        print(f"错误: 找不到内核文件 {KERNEL_PATH}")
        sys.exit(1)
    except PermissionError:
        print(f"错误: 权限不足，请执行: chmod +x {KERNEL_PATH}")
        sys.exit(1)

def wait_for_api(process):
    """轮询等待 API 启动成功"""
    url = f"http://127.0.0.1:{TEST_CONTROLLER_PORT}/version"
    headers = {"Authorization": f"Bearer {TEST_SECRET}"}
    
    for i in range(20): # 最多等待 10 秒
        if process.poll() is not None:
            print(f"错误: 内核进程已意外退出，退出码: {process.returncode}")
            print("请检查上方输出的日志以确定原因 (通常是缺少 GeoIP 文件或配置错误)。")
            return False
        try:
            resp = requests.get(url, headers=headers, timeout=1)
            if resp.status_code == 200:
                print("内核启动成功！API 已就绪。")
                return True
        except:
            pass
        time.sleep(0.5)
    
    print("错误: 内核启动超时，请检查配置或内核文件。")
    return False

def load_csv_db(path):
    """读取 CSV 数据库"""
    db = {}
    if not os.path.exists(path):
        return db
    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (row['ip'], row['port'], row['protocol'])
            try:
                db[key] = {'pass': int(row['pass']), 'notpass': int(row['notpass'])}
            except: continue
    return db

def save_csv_db(path, db):
    """保存 CSV 数据库"""
    headers = ['ip', 'port', 'protocol', 'pass', 'notpass', 'success_rate']
    rows = []
    for (ip, port, protocol), stats in db.items():
        total = stats['pass'] + stats['notpass']
        rate = f"{(stats['pass'] / total * 100):.1f}" if total > 0 else "0.0"
        rows.append({
            'ip': ip, 'port': port, 'protocol': protocol,
            'pass': stats['pass'], 'notpass': stats['notpass'], 'success_rate': rate
        })
    
    rows.sort(key=lambda x: float(x['success_rate']), reverse=True)
    
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)

def test_single_node(proxy_name):
    """测试单个节点"""
    safe_name = requests.utils.quote(proxy_name)
    url = f"http://127.0.0.1:{TEST_CONTROLLER_PORT}/proxies/{safe_name}/delay"
    headers = {"Authorization": f"Bearer {TEST_SECRET}"}
    try:
        resp = requests.get(url, params={"timeout": TIMEOUT_MS, "url": TEST_URL}, headers=headers, timeout=3)
        if resp.status_code == 200:
            try:
                delay = resp.json().get('delay', -1)
            except:
                delay = -1
            return True, delay, None
        else:
            return False, -1, f"HTTP {resp.status_code}"
    except Exception as e:
        return False, -1, str(e)

def run_tests(proxies_list):
    """执行并发测试逻辑"""
    db = load_csv_db(CSV_DB_PATH)
    
    # 建立 name -> (ip, port, protocol) 映射
    name_map = {}
    for p in proxies_list:
        if 'server' in p and 'port' in p and 'name' in p:
            name_map[p['name']] = (p['server'], str(p['port']), p.get('type', 'unknown'))

    print(f"开始测试 {len(name_map)} 个节点...")
    
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        future_to_info = {executor.submit(test_single_node, name): (name, key) for name, key in name_map.items()}
        
        for future in concurrent.futures.as_completed(future_to_info):
            name, key = future_to_info[future]
            try:
                is_success, delay, error = future.result()
            except Exception as e:
                is_success, delay, error = False, -1, str(e)
            
            if is_success:
                print(f"[PASS] {name} | Delay: {delay}ms")
            else:
                print(f"[FAIL] {name} | Error: {error}")
            
            results.append((key, is_success))

    # 更新数据库
    update_cnt = 0
    for key, is_success in results:
        if key not in db:
            db[key] = {'pass': 0, 'notpass': 0}
        
        if is_success:
            db[key]['pass'] += 1
        else:
            db[key]['notpass'] += 1
        update_cnt += 1
        
    save_csv_db(CSV_DB_PATH, db)
    print(f"测试完成，已更新 {update_cnt} 条记录至 {CSV_DB_PATH}")

def cleanup(process):
    """清理工作：杀掉内核进程，删除临时文件"""
    if process:
        print("正在关闭测试内核...")
        process.terminate()
        process.wait()
    
    if os.path.exists(TEMP_CONFIG):
        try:
            os.remove(TEMP_CONFIG)
        except: pass
    print("清理完成。")

def main():
    parser = argparse.ArgumentParser(description="测试节点连通性")
    parser.add_argument('--url', type=str, help='从指定 URL 下载配置文件进行测试')
    args = parser.parse_args()

    process = None
    try:
        # 1. 生成配置
        proxies_list = generate_test_config(args.url)
        
        # 2. 启动内核
        process = start_kernel()
        
        # 3. 等待 API 就绪
        if wait_for_api(process):
            # 4. 运行测试
            run_tests(proxies_list)
        
    except KeyboardInterrupt:
        print("\n用户中断操作")
    except Exception as e:
        print(f"\n发生未知错误: {e}")
    finally:
        # 5. 无论如何都要清理现场
        cleanup(process)

if __name__ == "__main__":
    main()
