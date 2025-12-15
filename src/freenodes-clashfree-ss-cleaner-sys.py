# -*- coding: utf-8 -*-
import re
import os
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


def process_config_lines(lines: list[str]) -> list[str]:
    """
    处理Clash配置内容，执行清理操作。

    该函数不使用PyYAML，通过字符串和正则表达式操作实现：
    1. 找出所有 type 为 'ss' 且 cipher 也为 'ss' 的代理名称。
    2. 移除这些代理的定义行。
    3. 移除 proxy-groups 中对这些代理的引用行。
    4. 按白名单模式清理 `proxy-groups`，只保留指定的几个组。
    5. 重置 `rules` 配置块，仅保留指定的几条核心规则。

    Args:
        lines: 从配置文件读取的行列表。

    Returns:
        处理完成后的新行列表。
    """

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
    in_rules_section = False
    for line in lines_after_group_removal:
        # 使用 `strip()` 来处理行首可能存在的空格
        stripped_line = line.strip()
        if stripped_line == 'rules:':
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

    return final_lines


def find_latest_config_on_github(repo: str, token: str | None = None) -> dict | None:
    # 通过GitHub API查找仓库中最新的clash配置文件
    api_url = f"https://api.github.com/repos/{repo}/contents/"
    print(f"正在查询GitHub API: {api_url}")

    headers = {'Accept': 'application/vnd.github.v3+json'}
    if token:
        print("找到 GITHUB_TOKEN，将使用认证模式访问 API。")
        headers['Authorization'] = f"token {token}"
    else:
        print("警告: 未找到 GITHUB_TOKEN，将使用匿名模式访问 API，可能会遇到速率限制。")

    try:
        response = requests.get(api_url, headers=headers, timeout=15)
        response.raise_for_status()
        files = response.json()

        # 查找所有符合 clash<date>.yml 格式的文件
        config_files = []
        for file_info in files:
            if file_info['type'] == 'file' and re.match(r'clash\d{8,}\.yml', file_info['name']):
                config_files.append({
                    'name': file_info['name'],
                    'sha': file_info['sha'],
                    'download_url': file_info['download_url']
                })

        if not config_files:
            print("错误: 在仓库中未找到格式为 'clash<date>.yml' 的配置文件。", file=sys.stderr)
            return None

        # 按文件名（日期）降序排序，获取最新的一个
        latest_config = sorted(config_files, key=lambda x: x['name'], reverse=True)[0]
        print(f"找到最新配置文件: {latest_config['name']} (SHA: {latest_config['sha'][:7]})")
        return latest_config

    except requests.exceptions.RequestException as e:
        print(f"错误: 查询GitHub API时发生网络错误: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"错误: 解析API响应时发生未知错误: {e}", file=sys.stderr)
        return None


if __name__ == '__main__':
    # --- 配置区 ---
    # 脚本文件所在的目录 (src)
    script_dir = Path(__file__).resolve().parent
    # 项目根目录
    project_root = script_dir.parent
    # 定义输出目录和文件名
    output_dir_name = 's'
    sources_dir_name = 'sources'
    output_filename = 'freenodes-clashfree.yml'
    original_output_filename = 'freenodes-clashfree-original.yml'

    output_dir = project_root / output_dir_name
    output_path = output_dir / output_filename
    sha_file_path = output_dir / f"{output_filename}.sha"

    # --- 模式选择 ---
    source_lines = []
    update_sha_on_success = False

    # 检查是否为开发模式
    if len(sys.argv) > 1 and sys.argv[1] == 'dev':
        print("--- 运行在开发模式 ---")
        dev_config_path = project_root / 'resource' / 'freenodes-clashfree-template.yml'
        print(f"读取本地文件: {dev_config_path}")
        if not dev_config_path.is_file():
            print(f"错误: 开发模式输入文件 '{dev_config_path}' 未找到。", file=sys.stderr)
            sys.exit(1)
        source_lines = dev_config_path.read_text(encoding='utf-8').splitlines()
    else:
        print("--- 运行在生产模式 ---")
        # 1. 查找最新的配置文件信息
        github_token = os.getenv('GITHUB_TOKEN')
        latest_config = find_latest_config_on_github('free-nodes/clashfree', token=github_token)
        if not latest_config:
            sys.exit(1)

        # 2. 检查文件是否已更新
        new_sha = latest_config['sha']
        old_sha = ""
        if sha_file_path.is_file():
            old_sha = sha_file_path.read_text(encoding='utf-8').strip()

        if new_sha == old_sha:
            print(f"配置文件未更新 (SHA: {new_sha[:7]})。无需操作，脚本退出。")
            sys.exit(0)

        print(f"检测到配置文件更新: {old_sha[:7] if old_sha else 'None'} -> {new_sha[:7]}")

        # 3. 下载新文件
        download_url = latest_config['download_url']
        print(f"开始从 {download_url} 下载新配置文件...")
        try:
            response = requests.get(download_url, timeout=15)
            response.raise_for_status()
            print(f"下载成功，文件大小: {len(response.content)} 字节。")
            source_lines = response.text.splitlines()
        except requests.exceptions.RequestException as e:
            print(f"错误: 下载文件时发生网络错误: {e}", file=sys.stderr)
            sys.exit(1)
        
        # 只有在所有处理成功后才更新SHA
        update_sha_on_success = True

    # --- 处理与输出 ---
    if source_lines:
        # 定义并确保 sources 输出目录存在
        sources_output_dir = output_dir / sources_dir_name
        sources_output_dir.mkdir(parents=True, exist_ok=True)
        # 保存原始文件
        original_output_path = sources_output_dir / original_output_filename
        original_content = '\n'.join(source_lines) + '\n'
        original_output_path.write_text(original_content, encoding='utf-8')
        print(f"原始配置文件已保存到: {original_output_path}")
        print("\n开始清理配置文件...")
        cleaned_lines = process_config_lines(source_lines)
        # 确保输出目录存在
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path.write_text('\n'.join(cleaned_lines) + '\n', encoding='utf-8')
        print(f"\n清理完成。更新后的配置已写入 '{output_path}'")

        # 如果是在生产模式下成功处理，则更新SHA文件
        if update_sha_on_success:
            sha_file_path.write_text(new_sha, encoding='utf-8')
            print(f"已更新SHA记录文件: {sha_file_path}")