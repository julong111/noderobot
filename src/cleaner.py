# -*- coding: utf-8 -*-
import re
import os
import sys
import argparse
import logging
from pathlib import Path

import config
from core.github_api import GitHubClient
from core.logger import setup_logger

# 配置根 Logger (name=None)，确保能捕获所有模块（如 GitHubAPI, Network）的日志
root_logger = setup_logger(name=None)
# 获取当前脚本专用的 Logger
logger = logging.getLogger("FreenodesCleaner")

def _extract_proxy_name(line: str) -> str | None:
    # 使用正则表达式提取name字段的值
    match = re.search(r"name:\s*(?:\"([^\"]+)\"|'([^']+)'|([^,]+))", line)
    if not match:
        return None
    name = next((group for group in match.groups() if group is not None), None)
    return name.strip() if name else None


def filter_ss_proxies(lines: list[str]) -> set[str]:
    """
    从Clash配置文件中找出所有 type 为 'ss' 且 cipher 也为 'ss' 的代理名称。

    Args:
        lines: 从配置文件读取的行列表。

    Returns:
        一个包含所有需要移除的代理名称的集合。
    """
    proxies_to_remove_names = set()
    in_proxies_section = False
    for line in lines:
        stripped_line = line.strip()
        if stripped_line.startswith('proxies:'):
            in_proxies_section = True
            continue
        if in_proxies_section and not stripped_line.startswith('-'):
            if stripped_line and not stripped_line.startswith('#'):
                in_proxies_section = False

        if in_proxies_section and 'type: ss' in line and 'cipher: ss' in line:
            name = _extract_proxy_name(line)
            if name:
                proxies_to_remove_names.add(name)
    return proxies_to_remove_names

def process_config_lines(lines: list[str]) -> list[str]:
    """
    处理Clash配置内容，执行清理操作。
    保留了原有的正则处理逻辑，以确保注释和文件结构的完整性。
    """

    # 找出所有需要移除的SS类型代理名称
    proxies_to_remove_names = filter_ss_proxies(lines)

    if not proxies_to_remove_names:
        logger.info("没有找到需要清理的 SS 服务器配置。")
    else:
        logger.info(f"移除了 {len(proxies_to_remove_names)} 个 SS 服务器配置。")

    logger.info("开始清理代理和规则...")
    new_lines = []
    for line in lines:
        # 检查是否为要删除的代理定义行
        if 'type: ss' in line and 'cipher: ss' in line:
            name = _extract_proxy_name(line)
            if name in proxies_to_remove_names:
                continue

        # 检查是否为 proxy-group 中对要删除代理的引用
        stripped_line = line.strip()
        if stripped_line.startswith('- '):
            proxy_in_group = stripped_line[2:].strip().strip("'\"")
            if proxy_in_group in proxies_to_remove_names:
                continue

        new_lines.append(line)

    # 按白名单模式清理代理组
    logger.info("开始按白名单模式清理代理组...")
    groups_to_keep = {
        "🔰 节点选择",
        "♻️ 自动选择",
        "🎯 全球直连",
        "🐟 漏网之鱼",
    }

    lines_after_group_removal = []
    try:
        proxy_groups_start_index = -1
        for i, line in enumerate(new_lines):
            if line.strip().startswith('proxy-groups:'):
                proxy_groups_start_index = i
                break

        if proxy_groups_start_index == -1:
            logger.warning("未找到 'proxy-groups:' 配置块，跳过代理组清理。")
            lines_after_group_removal = new_lines
        else:
            proxy_groups_end_index = len(new_lines)
            for i in range(proxy_groups_start_index + 1, len(new_lines)):
                line = new_lines[i]
                if line.strip() and not line.startswith(' '):
                    proxy_groups_end_index = i
                    break

            lines_after_group_removal.extend(new_lines[:proxy_groups_start_index + 1])

            all_groups = []
            current_group_block = []
            group_section_lines = new_lines[proxy_groups_start_index + 1:proxy_groups_end_index]

            if group_section_lines:
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

            for group_block in all_groups:
                name_line = group_block[0]
                match = re.search(r'-\s+name:\s*(.*)', name_line)
                group_name = match.group(1).strip().strip("'\"") if match else ""

                if group_name in groups_to_keep:
                    lines_after_group_removal.extend(group_block)

            lines_after_group_removal.extend(new_lines[proxy_groups_end_index:])

    except Exception as e:
        logger.error(f"清理代理组时发生未知错误: {e}，将跳过此步骤。")
        lines_after_group_removal = new_lines

    # 重置 rules
    final_lines = []
    in_rules_section = False
    for line in lines_after_group_removal:
        stripped_line = line.strip()
        if stripped_line == 'rules:':
            in_rules_section = True
            final_lines.append(line)
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
            continue
        if in_rules_section and (stripped_line.startswith('-') or not stripped_line):
            continue
        in_rules_section = False
        final_lines.append(line)

    return final_lines


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Freenodes Cleaner')
    parser.add_argument('--token', type=str, help='GitHub API Token')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--skip-SHA', action='store_true', help='跳过SHA检查，强制更新')
    args = parser.parse_args()

    if args.debug:
        root_logger.setLevel(logging.DEBUG)
        for handler in root_logger.handlers:
            handler.setLevel(logging.DEBUG)
        logger.debug("调试模式已开启")

    source_lines = []
    newest_sha = ""

    github_token = args.token or os.getenv('REPO_API_TOKEN')
    client = GitHubClient(token=github_token)
    
    # 查询clashfree最新配置文件
    latest_config = client.find_latest_file('free-nodes/clashfree', r'clash\d{8,}\.yml')
    if not latest_config:
        sys.exit(1)

    newest_sha = latest_config['sha']
    local_sha = config.FREENODES_SHA_FILE.read_text(encoding='utf-8').strip() if config.FREENODES_SHA_FILE.is_file() else ""

    if not args.skip_SHA and newest_sha == local_sha:
        logger.info(f"配置文件未更新 (SHA: {newest_sha[:7]})。无需操作。")
        sys.exit(0)

    content = client.fetch_content(latest_config['download_url'])
    if not content:
        sys.exit(1)
    source_lines = content.splitlines()

    if source_lines:
        cleaned_lines = process_config_lines(source_lines)
        config.FREENODES_CLEANER_FILE.write_text('\n'.join(cleaned_lines) + '\n', encoding='utf-8')
        logger.info(f"清理完成。已写入 '{config.FREENODES_CLEANER_FILE}'")
        if newest_sha:
            config.FREENODES_SHA_FILE.write_text(newest_sha, encoding='utf-8')