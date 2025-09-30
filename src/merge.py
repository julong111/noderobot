# -*- coding: utf-8 -*-

import sys
from pathlib import Path
import ipaddress
import yaml

from datetime import datetime
import argparse
import json
import requests

# 使用绝对路径，以便在任何工作目录下都能正确运行
PWD = Path(__file__).resolve().parent


# 用于标记需要以单行风格（flow style）输出的字典
class FlowStyleDict(dict):
    pass


# --- 全局定义和配置YAML Dumper ---

# 使用自定义的Dumper来避免产生YAML锚点和别名，使输出更干净
class NoAliasDumper(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True

# 为 FlowStyleDict 类型注册一个自定义的 representer
# 这会告诉 PyYAML 如何将这个特定类型的对象转换为 YAML
def flow_style_dict_representer(dumper, data):
    return dumper.represent_mapping('tag:yaml.org,2002:map', data, flow_style=True)

NoAliasDumper.add_representer(FlowStyleDict, flow_style_dict_representer)

# 自定义Dumper以修复列表项的缩进问题
# PyYAML在处理flow-style的列表项时，不会正确应用父级的indent
class IndentedDumper(NoAliasDumper):
    def increase_indent(self, flow=False, indentless=False):
        # 强制为非flow的序列（列表）增加缩进
        # 通过将indentless强制设为False，确保列表项获得正确的缩进
        return super(IndentedDumper, self).increase_indent(flow, False)

# 用于标记需要以单引号风格输出的字符串
class SingleQuotedString(str):
    pass

# 为 SingleQuotedString 类型注册一个自定义的 representer
# 这会告诉 PyYAML 如何将这个特定类型的对象转换为 YAML
def single_quoted_string_representer(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style="'")

# 将新的 representer 注册到我们最终使用的 Dumper 上
IndentedDumper.add_representer(SingleQuotedString, single_quoted_string_representer)


def load_yaml_file(file_path: Path, exit_on_error: bool = True) -> dict:
    """
    安全地加载并解析一个YAML文件。

    Args:
        file_path: YAML文件的路径。
        exit_on_error: 如果文件未找到或解析失败，是否退出程序。

    Returns:
        解析后的Python字典。
    """
    print(f"正在加载文件: {file_path}")
    if not file_path.is_file():
        if exit_on_error:
            print(f"错误: 文件未找到 -> {file_path}", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"警告: 文件未找到 -> {file_path}，返回空配置。")
            return {}

    try:
        with file_path.open('r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        if exit_on_error:
            print(f"错误: 解析YAML文件 {file_path} 失败: {e}", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"警告: 解析YAML文件 {file_path} 失败: {e}，返回空配置。")
            return {}
    except Exception as e:
        if exit_on_error:
            print(f"错误: 读取文件 {file_path} 失败: {e}", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"警告: 读取文件 {file_path} 失败: {e}，返回空配置。")
            return {}

def load_yaml_from_string(content: str, source_name: str) -> dict:
    """
    从字符串内容中安全地加载并解析YAML。

    Args:
        content: 包含YAML内容的字符串。
        source_name: 来源名称，用于日志记录。

    Returns:
        解析后的Python字典。
    """
    if not content:
        print(f"警告: 来自 '{source_name}' 的内容为空，返回空配置。")
        return {}
    try:
        return yaml.safe_load(content)
    except yaml.YAMLError as e:
        print(f"警告: 解析来自 '{source_name}' 的YAML内容失败: {e}，返回空配置。")
        return {}
    except Exception as e:
        print(f"警告: 处理来自 '{source_name}' 的内容时发生未知错误: {e}，返回空配置。")
        return {}

def load_ip_blocklist(file_path: Path) -> tuple[set[str], set]:
    """
    从文件中加载IP黑名单,支持单个IP和CIDR格式。

    Args:
        file_path: IP黑名单文件的路径。

    Returns:
        一个元组,包含两个集合: (单个IP地址集合, IP网络对象集合)。
    """
    print(f"正在加载IP黑名单: {file_path}")
    if not file_path.is_file():
        print(f"警告: IP黑名单文件未找到 -> {file_path}，跳过IP过滤。")
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
                            print(f"警告: 无效的CIDR格式 '{line}', 已忽略。", file=sys.stderr)
                    else:
                        blocked_ips.add(line)
        print(f"已加载 {len(blocked_ips)} 个独立IP和 {len(blocked_networks)} 个IP段。")
        return blocked_ips, blocked_networks
    except Exception as e:
        print(f"错误: 读取IP黑名单文件 {file_path} 失败: {e}", file=sys.stderr)
        return set(), set()


def is_ip_blocked(server: str, blocked_ips: set[str], blocked_networks: set) -> bool:
    # 检查是否为单个被屏蔽的IP
    if server in blocked_ips:
        return True

    # 检查是否在被屏蔽的IP段内
    try:
        # 如果server是域名, ip_address会抛出ValueError
        ip_addr = ipaddress.ip_address(server)
        for network in blocked_networks:
            if ip_addr in network:
                return True
    except ValueError:
        # server是域名,不进行IP段匹配
        return False

    return False


def save_yaml_file(data: dict, file_path: Path):
    """
    将Python字典保存为YAML文件。

    Args:
        data: 要保存的字典数据。
        file_path: 输出文件的路径。
    """
    print(f"正在保存合并后的配置文件到: {file_path}")
    try:
        # 确保目标目录存在，如果不存在则创建
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with file_path.open('w', encoding='utf-8') as f:
            yaml.dump(
                data,
                f,
                Dumper=IndentedDumper,
                allow_unicode=True,
                sort_keys=False,
                indent=2,
                width=9999
            )
        print("保存成功。")
    except Exception as e:
        print(f"错误: 写入文件 {file_path} 失败: {e}", file=sys.stderr)
        sys.exit(1)


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


def load_all_proxies(sources_path: Path, project_root: Path) -> list[dict]:
    """从sources文件指定的来源加载所有代理。"""
    if not sources_path.is_file():
        print(f"错误: 代理来源文件未找到 -> {sources_path}", file=sys.stderr)
        sys.exit(1)

    print(f"\n--- 正在从 {sources_path.name} 加载代理来源 ---")
    try:
        with sources_path.open('r', encoding='utf-8') as f:
            sources = json.load(f)
    except json.JSONDecodeError as e:
        print(f"错误: 解析JSON文件 {sources_path} 失败: {e}", file=sys.stderr)
        sys.exit(1)

    all_proxies = []
    for source in sources:
        name = source.get('name', '未命名来源')
        url = source.get('url')
        if not url:
            print(f"警告: 来源 '{name}'缺少 'url'，已跳过。")
            continue

        print(f"\n正在处理来源: {name} ({url})")
        content = ""
        if url.startswith(('http://', 'https://')):
            try:
                response = requests.get(url, timeout=20)
                response.raise_for_status()
                content = response.text
                print(f"  - 已从URL下载内容 ({len(content)} 字符)。")
            except requests.RequestException as e:
                print(f"  - 警告: 从URL下载失败: {e}，已跳过此来源。")
                continue
        else:
            # 处理本地文件路径
            file_path = project_root / url
            if file_path.is_file():
                try:
                    content = file_path.read_text(encoding='utf-8')
                    print(f"  - 已读取本地文件内容 ({len(content)} 字符)。")
                except Exception as e:
                    print(f"  - 警告: 读取本地文件 {file_path} 失败: {e}，已跳过此来源。")
                    continue
            else:
                print(f"  - 警告: 本地文件未找到 -> {file_path}，已跳过此来源。")
                continue

        data = load_yaml_from_string(content, name)
        proxies = data.get('proxies', []) or []
        print(f"  - 从 '{name}' 找到 {len(proxies)} 个代理。")
        all_proxies.extend(proxies)

    return all_proxies


def main(args):
    """主执行函数"""
    print("--- 开始合并Clash配置文件 ---")

    # --- 文件路径定义 ---
    sources_path = Path(args.sources).resolve()
    template_path = Path(args.template).resolve()
    blocklist_path = Path(args.blocklist).resolve()
    output_path = Path(args.output).resolve()

    # --- 加载数据 ---
    template_data = load_yaml_file(template_path)
    all_proxies = load_all_proxies(sources_path, PWD)
    blocked_ips, blocked_networks = load_ip_blocklist(blocklist_path)

    # --- 清洗步骤 ---
    if blocked_ips or blocked_networks:
        print("\n--- 开始清洗代理 ---")
        original_count = len(all_proxies)
        all_proxies = [
            p for p in all_proxies
            if not is_ip_blocked(p.get('server', ''), blocked_ips, blocked_networks)
        ]
        filtered_count = original_count - len(all_proxies)
        print(f"根据IP黑名单共过滤了 {filtered_count} 个代理。")

    # --- 合并与去重 ---
    print("\n--- 开始合并与去重 ---")
    unique_proxies = []
    seen_keys = set()

    for proxy in all_proxies:
        if not isinstance(proxy, dict) or 'server' not in proxy or 'port' not in proxy:
            continue
        # 使用 (服务器, 端口) 作为唯一标识符
        key = (proxy['server'], proxy['port'])
        if key not in seen_keys:
            seen_keys.add(key)
            ordered_proxy = reorder_proxy_keys(proxy)
            # 将代理字典包装在 FlowStyleDict 中，以便以单行风格输出
            unique_proxies.append(FlowStyleDict(ordered_proxy))
        else:
            if args.dev:
                print(f"  - 发现重复代理，已跳过: {key[0]}:{key[1]}")

    print(f"\n合并去重后，总计 {len(unique_proxies)} 个独立代理。")

    # --- 排序 ---
    print("\n--- 开始对代理列表按名称排序 ---")
    # 使用 proxy.get('name', '') 确保即使缺少name键也不会出错
    unique_proxies.sort(key=lambda p: p.get('name', ''))
    print("排序完成。")

    # --- 新增时间戳节点 ---
    print("\n--- 新增时间戳节点 ---")
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
    unique_proxies.append(FlowStyleDict(timestamp_node))
    print(f"已在 proxies 列表末尾新增: {timestamp_node_name}")

    # --- 构建最终配置 ---
    print("\n--- 开始构建最终配置文件 ---")
    final_config = template_data
    final_config['proxies'] = unique_proxies

    # --- 保存结果 ---
    save_yaml_file(final_config, output_path)
    print("--- 合并完成 ---")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='合并Clash配置文件并根据黑名单进行过滤。')
    parser.add_argument('--sources', type=str,
                        default=str(PWD / 'sources.json'),
                        help='包含代理来源(本地文件或URL)的JSON文件路径。')
    parser.add_argument('--template', type=str,
                        default=str(PWD / '..' / 'resource' / 'merge-template.yml'),
                        help='用作最终配置结构的基础模板文件路径。')
    parser.add_argument('--blocklist', type=str,
                        default=str(PWD / 'ip_blocklist.txt'),
                        help='IP黑名单文件路径。')
    parser.add_argument('--output', type=str,
                        default=str(PWD / '..' /  's' / 'merge.yml'),
                        help='最终合并配置的输出文件路径。')
    parser.add_argument('--dev', action='store_true',
                        help='启用开发者模式，打印更详细的日志信息（例如重复的代理）。')

    parsed_args = parser.parse_args()
    main(parsed_args)