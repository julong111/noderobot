# -*- coding: utf-8 -*-
import logging
from pathlib import Path
import ipaddress
import sys

logger = logging.getLogger("Core.GeoIP")

try:
    import geoip2.database
    HAS_GEOIP2 = True
except ImportError:
    geoip2 = None
    HAS_GEOIP2 = False

# 国家/地区名称简写映射表 (ISO Code -> Short Name)
COUNTRY_SHORT_NAMES = {
    'RU': '俄罗斯',
    'US': '美国',
    'GB': '英国',
    'FR': '法国',
    'DE': '德国',
    'JP': '日本',
    'KR': '韩国',
    'HK': '香港',
    'TW': '台湾',
    'MO': '澳门',
    'SG': '新加坡',
    'CA': '加拿大',
    'AU': '澳洲',
    'BR': '巴西',
    'IN': '印度',
    'ID': '印尼',
    'MY': '马来西亚',
    'TH': '泰国',
    'VN': '越南',
    'PH': '菲律宾',
    'TR': '土耳其',
    'AE': '阿联酋',
    'IT': '意大利',
    'ES': '西班牙',
    'NL': '荷兰',
    'SE': '瑞典',
    'CH': '瑞士',
    'PL': '波兰',
    'UA': '乌克兰',
    'CN': '中国',
    'KP': '朝鲜',
}

def is_available() -> bool:
    """检查 GeoIP 功能是否可用（依赖库是否安装）"""
    return HAS_GEOIP2

def get_ip_country(address: str, db_path: Path) -> tuple[str, str, str]:
    """
    根据 IP 或域名查询国家代码和名称。
    
    Args:
        address: IP 地址或域名
        db_path: GeoIP 数据库路径
        
    Returns:
        (code, name, city)，例如 ('US', 'United States', 'California Los Angeles')。
        如果查询失败、数据库不存在或解析失败，返回 ('UNK', 'Unknown')。
    """
    if not HAS_GEOIP2 or not db_path.is_file():
        logger.info("GEOIP不存在，程序退出。")
        sys.exit(0)

    # 检查 address 是否为有效 IP，如果不是（即为域名），则直接返回
    try:
        ipaddress.ip_address(address)
    except ValueError:
        logger.debug(f"'{address}' is a domain name, skipping GeoIP lookup.")
        return "XX", "", ""

    try:
        # 指定 locales=['zh-CN', 'en'] 以优先获取中文名称
        with geoip2.database.Reader(db_path, locales=['zh-CN', 'en']) as reader:
            city_detail = ""
            try:
                response = reader.city(address)
                parts = []
                if response.subdivisions.most_specific.name:
                    parts.append(response.subdivisions.most_specific.name)
                if response.city.name and response.city.name != response.subdivisions.most_specific.name:
                    parts.append(response.city.name)
                city_detail = " ".join(parts)
            except (TypeError, AttributeError):
                response = reader.country(address)

            code = response.country.iso_code
            name = response.country.name
            
            # 如果存在简写映射，则使用简写
            if code and code in COUNTRY_SHORT_NAMES:
                name = COUNTRY_SHORT_NAMES[code]
                
            return (code if code else "XX"), (name if name else ""), city_detail
    except geoip2.errors.AddressNotFoundError:
        logger.debug(f"Address '{address}' not found in GeoIP database.")
        return "XX", "", ""
    except Exception as e:
        logger.warning(f"An unexpected error occurred during GeoIP lookup for '{address}': {e}")
        return "XX", "", ""