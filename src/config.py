# -*- coding: utf-8 -*-
from pathlib import Path

# 基础路径
SRC_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SRC_DIR.parent
CONFIG_ROOT = PROJECT_ROOT / 'config'
# RESOURCE_DIR = PROJECT_ROOT / 'resource'
OUTPUT_DIR = PROJECT_ROOT / 's'

# 确保输出目录存在
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# 具体文件路径
SOURCES_CONFIG_FILE = CONFIG_ROOT / 'sources.json'
IP_BLOCKLIST_FILE = CONFIG_ROOT / 'ip-block-list.txt'
MANUAL_NODES_FILE = CONFIG_ROOT / 'manual_nodes.yml'
MERGE_TEMPLATE_FILE = CONFIG_ROOT / 'templates' / 'clash' / 'merge-template.yml'
MERGE_OUTPUT_FILE = OUTPUT_DIR / 'merge.yml'

ORIGINAL_DATA_DIR = OUTPUT_DIR / 'original'
GEOIP_DB_FILE = CONFIG_ROOT / 'Country.mmdb'
GEOIP_CITY_DB_FILE = CONFIG_ROOT / 'City.mmdb'

# Freenodes 清洗脚本配置
FREENODES_CLEANER_FILE = ORIGINAL_DATA_DIR / 'freenodes-clashfree-cleaner.yml'
FREENODES_SHA_FILE = ORIGINAL_DATA_DIR / 'freenodes-clashfree.yml.sha'

# 统计文件
NODE_STATS_FILE = OUTPUT_DIR / 'node-server-statistics.csv'