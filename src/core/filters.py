# -*- coding: utf-8 -*-
import ipaddress
import logging
from pathlib import Path

logger = logging.getLogger("Core.Filters")

def load_ip_blocklist(file_path: Path) -> tuple[set[str], set]:
    """
    从文件中加载IP黑名单,支持单个IP和CIDR格式。

    Args:
        file_path: IP黑名单文件的路径。

    Returns:
        一个元组,包含两个集合: (单个IP地址集合, IP网络对象集合)。
    """
    logger.info(f"正在加载IP黑名单: {file_path}")
    if not file_path.is_file():
        logger.warning(f"IP黑名单文件未找到 -> {file_path}，跳过IP过滤。")
        return set(), set()

    blocked_ips = set()
    blocked_networks = set()
    try:
        with file_path.open('r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '/' in line:
                        try:
                            # strict=False 允许 1.2.3.4/24 这种写法
                            network = ipaddress.ip_network(line, strict=False)
                            blocked_networks.add(network)
                        except ValueError:
                            logger.warning(f"无效的CIDR格式 '{line}', 已忽略。")
                    else:
                        blocked_ips.add(line)
        logger.info(f"已加载 {len(blocked_ips)} 个独立IP和 {len(blocked_networks)} 个IP段。")
        return blocked_ips, blocked_networks
    except Exception as e:
        logger.error(f"读取IP黑名单文件 {file_path} 失败: {e}")
        return set(), set()


def is_ip_blocked(server: str, blocked_ips: set[str], blocked_networks: set) -> bool:
    # 移除可能存在的 [] 包裹 (IPv6)
    server_clean = server.strip('[]')

    # 检查是否为单个被屏蔽的IP
    if server_clean in blocked_ips:
        return True

    # 检查是否在被屏蔽的IP段内
    try:
        # 如果server是域名, ip_address会抛出ValueError
        ip_addr = ipaddress.ip_address(server_clean)
        for network in blocked_networks:
            if ip_addr in network:
                return True
    except ValueError:
        # server是域名,不进行IP段匹配
        return False

    return False