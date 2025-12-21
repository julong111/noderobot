# -*- coding: utf-8 -*-
import logging
from core.yaml_handler import SingleQuotedString, FlowStyleDict

logger = logging.getLogger("Core.ProxyTools")

def reorder_proxy_keys(proxy: dict) -> dict:
    # 对代理字典的键进行排序: name, port, type 优先, 其余按字母排序。
    # 注意: 此函数会通过 pop 修改传入的 proxy 字典。
    preferred_order = ['name', 'server', 'port', 'type', 'cipher']

    ordered_proxy = {}

    for key in preferred_order:
        if key in proxy:
            ordered_proxy[key] = proxy.pop(key)

    # 强制name字段的值使用单引号，以保证格式统一
    # PyYAML会处理好任何必要的内部转义
    if 'name' in ordered_proxy and isinstance(ordered_proxy['name'], str):
        ordered_proxy['name'] = SingleQuotedString(ordered_proxy['name'])

    # 添加剩余的、按字母排序的键
    for key in sorted(proxy.keys()):
        ordered_proxy[key] = proxy[key]

    return ordered_proxy


def make_hashable(obj):
    """递归地将字典、列表或集合转换为可哈希的格式。"""
    if isinstance(obj, dict):
        # 对字典，递归处理其键和值，并返回一个可哈希的frozenset
        return frozenset((k, make_hashable(v)) for k, v in sorted(obj.items()))
    if isinstance(obj, list):
        # 对列表，递归处理其所有元素，并返回一个元组
        return tuple(make_hashable(e) for e in obj)
    if isinstance(obj, set):
        # 对集合，递归处理其所有元素，并返回一个frozenset
        return frozenset(make_hashable(e) for e in sorted(list(obj)))
    # 对于SingleQuotedString，先转换为普通字符串
    if isinstance(obj, SingleQuotedString):
        return str(obj)
    # 其他基本类型（int, str, bool, None等）本身就是可哈希的
    return obj


def deduplicate_proxies(proxies: list[dict], debug: bool = False) -> list[FlowStyleDict]:
    """
    对代理列表进行去重，并格式化键值顺序。
    使用 (server, port) 作为唯一标识符。
    """
    unique_proxies = []
    seen_keys = set()

    for proxy in proxies:
        if not isinstance(proxy, dict) or 'server' not in proxy or 'port' not in proxy:
            continue
        
        key = (proxy['server'], proxy['port'])
        if key not in seen_keys:
            seen_keys.add(key)
            ordered_proxy = reorder_proxy_keys(proxy)
            # 将代理字典包装在 FlowStyleDict 中，以便以单行风格输出
            unique_proxies.append(FlowStyleDict(ordered_proxy))
        else:
            if debug:
                logger.debug(f"  - 发现重复代理，已跳过: {key[0]}:{key[1]}")
    
    return unique_proxies


def apply_node_statistics(proxies: list[dict], stats: dict) -> list[dict]:
    """
    根据统计数据更新节点名称。
    格式: {count}#{original_name}
    """
    for proxy in proxies:
        if not isinstance(proxy, dict):
            continue
            
        server = proxy.get('server')
        if server:
            count = stats.get(server, 0)
            # 必须将 SingleQuotedString 转换为普通字符串再拼接
            original_name = str(proxy.get('name', ''))
            proxy['name'] = SingleQuotedString(f"{count}#{original_name}")
    
    return proxies