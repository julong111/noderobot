import yaml
import re
import os
import sys
import config

def extract_leading_number(name):
    """
    从字符串开头提取数字。
    例如: "101 香港节点" -> 101
    如果没有数字，返回 -1 以便排在最后。
    """
    if not isinstance(name, str):
        return -1
    
    match = re.match(r'^(\d+)', name.strip())
    if match:
        return int(match.group(1))
    return -1

def main():
    # 1. 确定 merge.yml 的路径 (从 config.py 读取)
    yaml_path = config.MERGE_OUTPUT_FILE

    if not yaml_path.exists():
        print(f"错误: 找不到文件 {yaml_path}")
        return

    print(f"正在读取文件: {yaml_path} ...")

    # 2. 读取 YAML 文件
    try:
        with open(yaml_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except Exception as e:
        print(f"读取 YAML 失败: {e}")
        return

    # 3. 获取节点列表
    # 通常 Clash 配置的节点在 'proxies' 键下，如果是纯列表则直接使用
    proxies = []
    if isinstance(data, dict) and 'proxies' in data:
        proxies = data['proxies']
    elif isinstance(data, list):
        proxies = data
    else:
        print("错误: 无法识别 YAML 结构，未找到节点列表。")
        return

    if not proxies:
        print("未找到任何节点。")
        return

    # 4. 排序逻辑
    # 过滤掉没有 'name' 字段的节点，并按名称前的数字从大到小排序
    # key 解释: 获取 name -> 提取数字 -> 用于排序
    sorted_proxies = sorted(
        [p for p in proxies if isinstance(p, dict) and 'name' in p],
        key=lambda x: extract_leading_number(x['name']),
        reverse=True
    )

    # 5. 提取前 10 个并打印
    top_10 = sorted_proxies[:10]

    print(f"\n--- 统计数字最大的前 {len(top_10)} 个节点 ---")
    for proxy in top_10:
        # 转换为单行 Flow Style 格式 ({ key: value })，并添加列表项前缀 "- "
        line = yaml.dump(proxy, allow_unicode=True, default_flow_style=True, sort_keys=False, width=float("inf")).strip()
        print(f"  - {line}")

if __name__ == "__main__":
    main()
