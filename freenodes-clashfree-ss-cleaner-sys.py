# -*- coding: utf-8 -*-
import re
import sys
import requests
from pathlib import Path


def _extract_proxy_name(line: str) -> str | None:
    # 使用正则表达式提取name字段的值
    # 1. `name:\s*` 匹配 "name:" 和任意空格
    # 2. `(?:"([^"]+)"|'([^']+)'|([^,]+))` 是一个捕获组，包含三种情况：
    #    - `"(^"]+)"`: 匹配双引号括起来的名称
    #    - `'([^']+)'`: 匹配单引号括起来的名称
    #    - `([^,]+)`: 匹配直到下一个逗号的、不包含引号的名称
    match = re.search(r"name:\s*(?:\"([^\"]+)\"|'([^']+)'|([^,]+))", line)
    if not match:
        return None

    # match.groups() 会返回所有捕获组的内容，我们取第一个非None的值
    # 例如, 对于 name: "proxy 1", groups() 是 ('proxy 1', None, None)
    # 对于 name: proxy2, groups() 是 (None, None, 'proxy2')
    name = next((group for group in match.groups() if group is not None), None)
    return name.strip() if name else None


def clean_clash_config(file_path: str | Path):
    """
    读取Clash YAML配置文件，执行清理操作。

    该函数不使用PyYAML，通过字符串和正则表达式操作实现：
    1. 找出所有 type 为 'ss' 且 cipher 也为 'ss' 的代理名称。
    2. 移除这些代理的定义行。
    3. 移除 proxy-groups 中对这些代理的引用行。
    4. 按白名单模式清理 `proxy-groups`，只保留指定的几个组。
    5. 重置 `rules` 配置块，仅保留指定的几条核心规则。
    6. 将修改写回原文件。

    Args:
        file_path: Clash YAML配置文件的路径。
    """
    config_path = Path(file_path)
    if not config_path.is_file():
        print(f"错误: 文件 '{file_path}' 未找到。", file=sys.stderr)
        sys.exit(1)

    try:
        lines = config_path.read_text(encoding='utf-8').splitlines()
    except Exception as e:
        print(f"错误: 读取文件失败: {e}", file=sys.stderr)
        sys.exit(1)

    # 找出所有需要移除的代理名称
    proxies_to_remove_names = set()
    in_proxies_section = False
    for line in lines:
        stripped_line = line.strip()
        if stripped_line.startswith('proxies:'):
            in_proxies_section = True
            continue
        # 假设proxies是顶层key，下一个顶层key出现时，proxies部分结束
        if in_proxies_section and not stripped_line.startswith('-'):
            if stripped_line and not stripped_line.startswith('#'):
                in_proxies_section = False

        if in_proxies_section and 'type: ss' in line and 'cipher: ss' in line:
            name = _extract_proxy_name(line)
            if name:
                proxies_to_remove_names.add(name)

    if not proxies_to_remove_names:
        print("没有找到需要清理的 SS 服务器配置。")
    else:
        print("以下 SS 服务器配置将被移除:")
        for name in sorted(list(proxies_to_remove_names)):
            print(f"- {name}")

    print("\n开始清理代理和规则...")
    # 构建新的文件内容
    new_lines = []
    for line in lines:
        # 检查是否为要删除的代理定义行
        if 'type: ss' in line and 'cipher: ss' in line:
            name = _extract_proxy_name(line)
            if name in proxies_to_remove_names:
                continue  # 跳过此行

        # 检查是否为 proxy-group 中对要删除代理的引用
        stripped_line = line.strip()
        if stripped_line.startswith('- '):
            proxy_in_group = stripped_line[2:].strip().strip("'\"")
            if proxy_in_group in proxies_to_remove_names:
                continue  # 跳过此行

        new_lines.append(line)

    # 按白名单模式清理代理组
    print("\n开始按白名单模式清理代理组...")
    groups_to_keep = {
        "🔰 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连",
        "🐟 漏网之鱼",
    }

    lines_after_group_removal = []
    try:
        # 找到 proxy-groups 部分的起止位置
        proxy_groups_start_index = -1
        for i, line in enumerate(new_lines):
            if line.strip().startswith('proxy-groups:'):
                proxy_groups_start_index = i
                break

        if proxy_groups_start_index == -1:
            print("警告: 未找到 'proxy-groups:' 配置块，跳过代理组清理。")
            lines_after_group_removal = new_lines
        else:
            proxy_groups_end_index = len(new_lines)
            for i in range(proxy_groups_start_index + 1, len(new_lines)):
                line = new_lines[i]
                if line.strip() and not line.startswith(' '):
                    proxy_groups_end_index = i
                    break

            # 添加 proxy-groups 之前的内容
            lines_after_group_removal.extend(new_lines[:proxy_groups_start_index + 1])

            # 将 proxy-groups 部分解析为独立的组块
            all_groups = []
            current_group_block = []
            group_section_lines = new_lines[proxy_groups_start_index + 1:proxy_groups_end_index]

            if group_section_lines:
                # 确定组定义行的缩进
                group_start_indent = len(group_section_lines[0]) - len(group_section_lines[0].lstrip(' '))

                for line in group_section_lines:
                    current_indent = len(line) - len(line.lstrip(' '))
                    if line.strip() and current_indent == group_start_indent and line.lstrip().startswith('-'):
                        if current_group_block:
                            all_groups.append(current_group_block)
                        current_group_block = [line]
                    else:
                        current_group_block.append(line)
                if current_group_block:
                    all_groups.append(current_group_block)

            # 根据白名单过滤组块
            for group_block in all_groups:
                name_line = group_block[0]
                match = re.search(r'-\s+name:\s*(.*)', name_line)
                group_name = match.group(1).strip().strip("'\"") if match else ""

                if group_name in groups_to_keep:
                    print(f"  - 保留代理组: {group_name}")
                    lines_after_group_removal.extend(group_block)
                elif group_name:
                    print(f"  - 移除代理组: {group_name}")

            # 添加 proxy-groups 之后的内容
            lines_after_group_removal.extend(new_lines[proxy_groups_end_index:])

    except Exception as e:
        print(f"错误: 清理代理组时发生未知错误: {e}，将跳过此步骤。", file=sys.stderr)
        lines_after_group_removal = new_lines

    # 查找并重置 rules 区域
    final_lines = []
    rules_section_found = False
    in_rules_section = False
    for line in lines_after_group_removal:
        # 使用 `strip()` 来处理行首可能存在的空格
        stripped_line = line.strip()
        if stripped_line == 'rules:':
            rules_section_found = True
            in_rules_section = True
            final_lines.append(line)  # 保留 'rules:' 这一行
            # 添加新的、固定的规则列表
            new_rules = [
                '  - DOMAIN-SUFFIX,local,🎯 全球直连',
                '  - IP-CIDR,192.168.0.0/16,🎯 全球直连,no-resolve',
                '  - IP-CIDR,10.0.0.0/8,🎯 全球直连,no-resolve',
                '  - IP-CIDR,172.16.0.0/12,🎯 全球直连,no-resolve',
                '  - IP-CIDR,127.0.0.0/8,🎯 全球直连,no-resolve',
                '  - IP-CIDR,100.64.0.0/10,🎯 全球直连,no-resolve',
                '  - IP-CIDR6,::1/128,🎯 全球直连,no-resolve',
                '  - IP-CIDR6,fc00::/7,🎯 全球直连,no-resolve',
                '  - IP-CIDR6,fe80::/10,🎯 全球直连,no-resolve',
                '  - IP-CIDR6,fd00::/8,🎯 全球直连,no-resolve',
                '  - GEOIP,CN,🎯 全球直连',
                '  - MATCH,🐟 漏网之鱼',
            ]
            final_lines.extend(new_rules)
            print("找到 'rules:' 配置，已重置为指定的规则列表。")
            continue
        # 如果在 rules 区域内，且不是下一个顶层key，则跳过旧规则
        if in_rules_section and (stripped_line.startswith('-') or not stripped_line):
            continue
        in_rules_section = False  # 遇到下一个顶层key，rules区域结束
        final_lines.append(line)

    try:
        config_path.write_text('\n'.join(final_lines) + '\n', encoding='utf-8')
        print(f"\n清理完成。更新后的配置已写回 '{file_path}'")
    except Exception as e:
        print(f"错误: 写入文件失败: {e}", file=sys.stderr)
        sys.exit(1)


def download_config_file(url: str, destination_path: Path) -> bool:
    """从指定的URL下载文件并保存到本地。"""
    print(f"开始从 {url} 下载配置文件...")
    # 设置合理的超时时间，防止无限期等待
    timeout_seconds = 15
    try:
        response = requests.get(url, timeout=timeout_seconds)
        # 如果HTTP响应状态码不是200-299，则会引发HTTPError异常
        response.raise_for_status()

        content = response.content
        print(f"下载成功，文件大小: {len(content)} 字节。")

        destination_path.write_bytes(content)
        print(f"配置文件已保存到: {destination_path}")
        return True
    except requests.exceptions.RequestException as e:
        print(f"错误: 下载文件时发生网络错误: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"错误: 处理下载或保存文件时发生未知错误: {e}", file=sys.stderr)
        return False


if __name__ == '__main__':
    CONFIG_URL = 'https://raw.githubusercontent.com/free-nodes/clashfree/refs/heads/main/clash.yml'
    LOCAL_FILENAME = 'freenodes-clashfree.yml'
    script_dir = Path(__file__).resolve().parent
    local_config_path = script_dir / LOCAL_FILENAME

    if download_config_file(CONFIG_URL, local_config_path):
        print("\n开始清理下载的配置文件...")
        clean_clash_config(local_config_path)