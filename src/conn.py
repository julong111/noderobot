import yaml
import csv
import os
import sys
import argparse
import requests

# ================= 配置区域 =================
# 获取当前脚本所在目录
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)

# 文件路径配置
MERGE_YAML_PATH = os.path.join(PROJECT_ROOT, "s", "merge.yml")
CSV_PATH = os.path.join(PROJECT_ROOT, "s", "node-connective.csv")
# ===========================================

def load_csv_db(path):
    """读取 CSV 数据库到内存字典"""
    db = {}
    if not os.path.exists(path):
        return db
    
    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # 使用 (ip, port, protocol) 作为唯一键
            # 注意：CSV 中的 port 是字符串，需要保持一致
            key = (row['ip'], str(row['port']), row['protocol'])
            try:
                db[key] = {
                    'pass': int(row['pass']),
                    'notpass': int(row['notpass'])
                }
            except ValueError:
                continue
    return db

def main():
    parser = argparse.ArgumentParser(description="根据连通性历史记录过滤节点")
    parser.add_argument('--url', type=str, help='从指定 URL 下载配置文件')
    parser.add_argument('--outfile', type=str, default='conn.yml', help='输出文件名 (默认: conn.yml)')
    args = parser.parse_args()

    # 1. 加载历史数据
    if not os.path.exists(CSV_PATH):
        print(f"错误: 找不到 CSV 文件 {CSV_PATH}")
        return
    
    db = load_csv_db(CSV_PATH)
    print(f"已加载历史记录: {len(db)} 条")

    # 2. 读取原始 YAML
    config = None
    if args.url:
        print(f"正在从 URL 下载配置: {args.url}")
        try:
            resp = requests.get(args.url, timeout=30)
            resp.raise_for_status()
            config = yaml.safe_load(resp.text)
        except Exception as e:
            print(f"下载或解析 URL 失败: {e}")
            return
    else:
        if not os.path.exists(MERGE_YAML_PATH):
            print(f"错误: 找不到 YAML 文件 {MERGE_YAML_PATH}")
            return

        with open(MERGE_YAML_PATH, 'r', encoding='utf-8') as f:
            try:
                config = yaml.safe_load(f)
            except Exception as e:
                print(f"解析 YAML 失败: {e}")
                return

    if 'proxies' not in config or not config['proxies']:
        print("警告: 配置文件中没有找到 proxies 节点")
        return

    # 3. 执行过滤逻辑
    original_proxies = config['proxies']
    filtered_proxies = []
    removed_count = 0

    print(f"开始过滤 {len(original_proxies)} 个节点...")

    for proxy in original_proxies:
        # 提取节点特征
        server = proxy.get('server')
        port = str(proxy.get('port'))
        protocol = proxy.get('type', 'unknown')
        name = proxy.get('name', 'Unknown')

        key = (server, port, protocol)
        
        keep = True
        if key in db:
            stats = db[key]
            pass_num = stats['pass']
            notpass_num = stats['notpass']

            total = pass_num + notpass_num
            if total > 0:
                rate = pass_num / total
                if rate <= 0.5:
                    keep = False
                    print(f"[剔除] {name} | Pass: {pass_num}, Fail: {notpass_num}, Rate: {rate:.1%}")
        
        if keep:
            filtered_proxies.append(proxy)
        else:
            removed_count += 1

    # 4. 保存结果
    config['proxies'] = filtered_proxies
    
    print("-" * 30)
    print(f"原始节点数: {len(original_proxies)}")
    print(f"剔除节点数: {removed_count}")
    print(f"剩余节点数: {len(filtered_proxies)}")
    
    # 构造输出路径，默认保存在 s 目录下
    output_path = os.path.join(PROJECT_ROOT, "s", args.outfile)
    with open(output_path, 'w', encoding='utf-8') as f:
        # allow_unicode=True 确保中文不乱码，sort_keys=False 保持字段顺序
        yaml.dump(config, f, allow_unicode=True, sort_keys=False)
    
    print(f"已生成新配置文件: {output_path}")

if __name__ == "__main__":
    main()