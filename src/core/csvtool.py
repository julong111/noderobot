# -*- coding: utf-8 -*-
import csv
import logging
from pathlib import Path
from collections import defaultdict

logger = logging.getLogger('CsvTool')

def read_stats(file_path: Path) -> defaultdict[str, int]:
    """
    读取节点服务器统计数据。
    如果文件不存在，返回一个空的 defaultdict。
    """
    stats = defaultdict(int)
    if not file_path.is_file():
        logger.info(f"统计文件 {file_path} 未找到，将创建新文件。")
        return stats

    try:
        with file_path.open('r', encoding='utf-8', newline='') as f:
            reader = csv.reader(f)
            for i, row in enumerate(reader):
                if not row or len(row) != 2:
                    logger.warning(f"跳过格式错误的行 {i+1}: {row}")
                    continue
                ip, count_str = row
                try:
                    stats[ip] = int(count_str)
                except ValueError:
                    logger.warning(f"跳过计数无效的行 {i+1}: {row}")
                    continue
        logger.info(f"成功从 {file_path} 读取 {len(stats)} 条统计记录。")
    except Exception as e:
        logger.error(f"读取统计文件 {file_path} 失败: {e}")
        # 返回一个空的 defaultdict 以避免下游错误
        return defaultdict(int)
    return stats

def update_stats(stats: defaultdict[str, int], server_ips: list[str]):
    """
    根据给定的服务器IP列表更新统计计数。
    """
    for ip in server_ips:
        stats[ip] += 1
    logger.info(f"更新了 {len(server_ips)} 个服务器的出现次数。")

def write_stats(file_path: Path, stats: defaultdict[str, int]):
    """
    将统计数据写回CSV文件。
    """
    try:
        # 按IP地址排序后写入
        sorted_items = sorted(stats.items())
        with file_path.open('w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerows(sorted_items)
        logger.info(f"成功将 {len(sorted_items)} 条统计记录写入 {file_path}。")
    except Exception as e:
        logger.error(f"写入统计文件 {file_path} 失败: {e}")