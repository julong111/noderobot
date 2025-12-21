# -*- coding: utf-8 -*-

import sys
from pathlib import Path
from datetime import datetime
import argparse
import json
import logging
import copy

import config
from core.yaml_handler import (
    load_yaml_file, save_yaml_file,
    FlowStyleDict, SingleQuotedString
)
from core.logger import setup_logger
from core import csvtool
from core import filters
from core import proxy_tools
from core import source_manager
from core import geoip

setup_logger(name=None)
logger = logging.getLogger("Merge")


def check_content_changes(new_proxies: list, output_path: Path, manual_file_path: Path) -> bool:
    """
    检查新生成的代理列表与现有文件是否一致。
    指纹仅基于 (server, port)，忽略名称、密码等其他字段。
    对比逻辑：(新抓取节点) vs (旧文件中的自动节点)。
    旧文件中的自动节点通过排除手动节点(名称含'|M|')和时间戳节点来识别。
    在对比前，会从新抓取节点中排除与手动节点IP冲突的节点。
    返回 True 表示有变化（或无旧文件），需要更新；False 表示无变化。
    """
    if not output_path.is_file():
        logger.info("未找到现有输出文件，将创建新文件。")
        return True

    logger.info("检查自动抓取节点与现有配置文件的差异")
    try:
        # 1. 加载旧文件
        logger.info("从merge中加载上一次的节点")
        old_config = load_yaml_file(output_path, exit_on_error=False)
        old_proxies = old_config.get('proxies', []) if old_config else []

        # 2. 加载手动节点，以排除IP冲突
        logger.info("从自动抓取的节点中移除手工节点")
        manual_proxies = []
        if manual_file_path.is_file():
            manual_data = load_yaml_file(manual_file_path, exit_on_error=False)
            if manual_data and isinstance(manual_data, dict):
                manual_proxies = manual_data.get('proxies', [])
        manual_servers = {p.get('server') for p in manual_proxies if p.get('server')}

        # 定义简化指纹: (server, port)
        def get_fingerprint(p):
            # 强制转换为字符串以避免类型不匹配 (如 443 vs "443", str vs SingleQuotedString)
            return (str(p.get('server')), str(p.get('port')))

        # 3. 构建新抓取节点的指纹集合 (排除与手动节点IP冲突的节点)
        # 这一步是为了确保与后续 merge_manual_nodes 的行为一致
        new_set = {
            get_fingerprint(p)
            for p in new_proxies
            if p.get('server') and p.get('server') not in manual_servers
        }

        # 4. 构建旧文件中自动抓取节点的指纹集合
        # 从旧文件中移除手动节点（含'|M|'）和时间戳节点
        current_set = {
            get_fingerprint(p)
            for p in old_proxies
            if p.get('server') and
               '|M|' not in p.get('name', '') and
               '-Timestamp' not in p.get('name', '')
        }

        # 5. 集合对比
        if new_set == current_set:
            logger.info("自动抓取的代理列表(IP/Port)与现有文件一致，无需更新。")
            return False

        # 找出并记录差异
        added_proxies = new_set - current_set
        removed_proxies = current_set - new_set

        logger.info("代理列表有更新，将继续生成新文件。")
        if added_proxies:
            logger.info(f"  - 新增节点 ({len(added_proxies)}):")
            for ip, port in sorted(list(added_proxies)):
                logger.info(f"    - {ip}:{port}")
        if removed_proxies:
            logger.info(f"  - 移除节点 ({len(removed_proxies)}):")
            for ip, port in sorted(list(removed_proxies)):
                logger.info(f"    - {ip}:{port}")

        return True
    except Exception as e:
        logger.warning(f"差异检测过程中出错: {e}，将默认视为有更新。")
        return True


def merge_manual_nodes(unique_proxies: list, manual_file_path: Path) -> list:
    """加载并合并手动配置的节点，同时移除与手动节点IP重复的自动抓取节点。"""
    logger.info("正在加载并添加手动配置节点")
    if not manual_file_path.is_file():
        return unique_proxies

    try:
        manual_data = load_yaml_file(manual_file_path, exit_on_error=False)
        if manual_data and isinstance(manual_data, dict):
            manual_proxies = manual_data.get('proxies', [])

            # 提取手动配置中的服务器地址
            manual_servers = {p.get('server') for p in manual_proxies if isinstance(p, dict) and p.get('server')}
            
            if manual_servers:
                # 找出将要被移除的节点以便记录日志
                removed_proxies = [p for p in unique_proxies if p.get('server') in manual_servers]
                if removed_proxies:
                    unique_proxies = [p for p in unique_proxies if p.get('server') not in manual_servers]
                    removed_servers = [str(p.get('server')) for p in removed_proxies]
                    logger.info(f"已移除 {len(removed_proxies)} 个与手动配置重复的自动抓取节点: {', '.join(removed_servers)}")

            for proxy in manual_proxies:
                if isinstance(proxy, dict):
                    ordered_proxy = proxy_tools.reorder_proxy_keys(proxy)
                    unique_proxies.append(FlowStyleDict(ordered_proxy))
            logger.info(f"已添加 {len(manual_proxies)} 个手动精选节点。")
    except Exception as e:
        logger.warning(f"加载手动节点文件出错: {e}")
    
    return unique_proxies


def get_flag(country_code: str) -> str:
    """将国家代码转换为 Emoji 国旗"""
    if not country_code or len(country_code) != 2 or country_code == 'UNK':
        return "🏁"
    # 区域指示符符号 A 的 Unicode 是 127462，'A' 是 65，偏移量 127397
    return "".join([chr(ord(c) + 127397) for c in country_code.upper()])


def rename_proxies_by_country(proxies: list, db_path: Path, debug: bool = False) -> list:
    """根据 IP 归属地重命名代理"""
    if not geoip.is_available():
        logger.warning("geoip2 模块未安装，跳过国家/地区重命名。(请运行 pip install geoip2)")
        return proxies
    
    if not db_path.is_file():
        logger.warning(f"GeoIP 数据库未找到: {db_path}，跳过重命名。")
        return proxies

    logger.info("开始根据 IP 归属地重命名节点...")
    country_counter = {}
    
    for proxy in proxies:
        original_name = proxy.get('name', '')
        # 如果是手动节点（名称包含|M|），则跳过重命名
        if '|M|' in str(original_name):
            if debug:
                logger.debug(f"跳过对 手动节点 的重命名: {original_name}")
            continue

        server = proxy.get('server')
        if not server:
            continue
            
        code, country, city = geoip.get_ip_country(server, db_path)
        
        # 统计计数，用于生成序号
        count = country_counter.get(code, 0) + 1
        country_counter[code] = count
        flag = get_flag(code)
        if code == 'XX':
            new_name = f"{flag} {code} {count:02d}"
        else:
            if city == '':
                new_name = f"{flag} {code}|{country} {count:02d}"
            else:
                new_name = f"{flag} {code}|{country}-{city} {count:02d}"
        proxy['name'] = SingleQuotedString(new_name)
        
        if debug:
            logger.debug(f"Renamed: {original_name} -> {new_name}")
        
    return proxies


def filter_proxies(proxies: list, blocklist_path: Path) -> list:
    """执行所有过滤逻辑：IP黑名单和HTTP协议过滤"""
    blocked_ips, blocked_networks = filters.load_ip_blocklist(blocklist_path)

    # IP黑名单过滤
    if blocked_ips or blocked_networks:
        logger.info("开始清洗代理 (IP黑名单)")
        original_count = len(proxies)
        proxies = [
            p for p in proxies
            if not filters.is_ip_blocked(p.get('server', ''), blocked_ips, blocked_networks)
        ]
        logger.info(f"根据IP黑名单共过滤了 {original_count - len(proxies)} 个代理。")

    # HTTP协议过滤
    logger.info("开始过滤HTTP代理")
    original_count = len(proxies)
    proxies = [p for p in proxies if p.get('type') != 'http']
    logger.info(f"共过滤了 {original_count - len(proxies)} 个HTTP类型的代理。")
    
    return proxies


def save_configs(proxies: list, template_data: dict, output_path: Path):
    """构建并保存最终的配置文件 (merge.yml 和 mobile.yml)"""
    # --- 新增时间戳节点 ---
    logger.info("新增时间戳节点")
    update_time_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    timestamp_node_name = f"[{update_time_str}]-Timestamp"
    timestamp_node = {
        'name': SingleQuotedString(timestamp_node_name),
        'type': 'ss',
        'server': '127.0.0.1',
        'port': 1,
        'cipher': 'none',
        'password': ' '
    }
    # 将其包装在 FlowStyleDict 中以便单行输出
    proxies.append(FlowStyleDict(timestamp_node))
    logger.info(f"已在 proxies 列表末尾新增: {timestamp_node_name}")

    # --- 构建最终配置 ---
    logger.info("开始构建最终配置文件")
    final_config = template_data
    final_config['proxies'] = proxies

    # --- 保存结果 ---
    save_yaml_file(final_config, output_path)

    # --- 生成并保存 mobile.yml ---
    logger.info("正在生成 mobile.yml (去除 rules 和 rule-providers)")
    mobile_config = copy.deepcopy(final_config)
    mobile_config.pop('rules', None)
    mobile_config.pop('rule-providers', None)
    save_yaml_file(mobile_config, config.MOBILE_OUTPUT_FILE)

    logger.info("合并完成")


def main(args):
    """主执行函数"""
    if args.dev:
        root_logger = logging.getLogger()
        root_logger.setLevel(logging.DEBUG)
        for handler in root_logger.handlers:
            handler.setLevel(logging.DEBUG)
        logger.debug("开发者模式已开启 (Log Level: DEBUG)")

    logger.info("开始合并Clash配置文件")

    # --- 文件路径定义 ---
    sources_path = Path(args.sources).resolve()
    template_path = Path(args.template).resolve()
    blocklist_path = Path(args.blocklist).resolve()
    output_path = Path(args.output).resolve()

    # --- 加载数据 ---
    template_data = load_yaml_file(template_path)
    all_proxies, sources_data, has_updates = source_manager.load_and_update_sources(sources_path)
    
    if not has_updates:
        if args.dev:
            logger.info("开发者模式：忽略来源更新检测，继续执行。")
        else:
            logger.info("所有来源均无更新，程序退出。")
            sys.exit(0)

    # 保存更新后的 sources.json
    try:
        with sources_path.open('w', encoding='utf-8') as f:
            json.dump(sources_data, f, indent=2, ensure_ascii=False)
        logger.info(f"已更新来源配置文件: {sources_path}")
    except Exception as e:
        logger.error(f"保存来源配置文件失败: {e}")

    # --- 清洗步骤 ---
    all_proxies = filter_proxies(all_proxies, blocklist_path)

    # --- 合并与去重 ---
    logger.info("开始合并与去重")
    unique_proxies = proxy_tools.deduplicate_proxies(all_proxies, debug=args.dev)
    logger.info(f"合并去重后，总计 {len(unique_proxies)} 个独立代理。")

    # --- 排序 ---
    logger.info("开始对代理列表按名称排序")
    # 使用 proxy.get('name', '') 确保即使缺少name键也不会出错
    unique_proxies.sort(key=lambda p: p.get('name', ''))
    logger.info("排序完成。")

    # --- 检查与旧文件是否有变化 ---
    if not args.skipcheck:
        if not check_content_changes(unique_proxies, output_path, config.MANUAL_NODES_FILE):
            logger.info("检测到自动抓取节点无变化，操作提前结束。")
            sys.exit(0)

    # --- 更新节点服务器统计 ---
    logger.info("开始更新节点服务器统计")
    # 提取所有有效节点的 server 字段
    server_ips = [p.get('server') for p in unique_proxies if p.get('server')]
    stats = csvtool.read_stats(config.NODE_STATS_FILE)
    if not args.skipcount:
        csvtool.update_stats(stats, server_ips)
        csvtool.write_stats(config.NODE_STATS_FILE, stats)
        logger.info("节点服务器统计更新完成。")
    else:
        logger.info("节点服务器统计跳过。")

    # --- 添加手动配置节点 ---
    unique_proxies = merge_manual_nodes(unique_proxies, config.MANUAL_NODES_FILE)

    # --- 根据 IP 归属地重命名 ---
    unique_proxies = rename_proxies_by_country(unique_proxies, config.GEOIP_CITY_DB_FILE, debug=args.dev)
    
    # --- 统一根据统计数据更新所有节点名称 ---
    logger.info("根据统计数据更新所有节点名称")
    unique_proxies = proxy_tools.apply_node_statistics(unique_proxies, stats)

    # --- 保存配置文件 ---
    save_configs(unique_proxies, template_data, output_path)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='合并Clash配置文件并根据黑名单进行过滤。')
    parser.add_argument('--sources', type=str,
                        default=str(config.SOURCES_CONFIG_FILE),
                        help='包含代理来源(本地文件或URL)的JSON文件路径。')
    parser.add_argument('--template', type=str,
                        default=str(config.MERGE_TEMPLATE_FILE),
                        help='用作最终配置结构的基础模板文件路径。')
    parser.add_argument('--blocklist', type=str,
                        default=str(config.IP_BLOCKLIST_FILE),
                        help='IP黑名单文件路径。')
    parser.add_argument('--output', type=str,
                        default=str(config.MERGE_OUTPUT_FILE),
                        help='最终合并配置的输出文件路径。')
    parser.add_argument('--dev', action='store_true',
                        help='启用开发者模式，打印更详细的日志信息（例如重复的代理）。')
    parser.add_argument('--skipcheck', action='store_true',
                        help='跳过旧文件对比检查')
    parser.add_argument('--skipcount', action='store_true',
                        help='update服务器计数')

    parsed_args = parser.parse_args()
    main(parsed_args)