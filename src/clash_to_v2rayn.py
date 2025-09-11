import yaml
import base64
import json
import sys
import urllib.parse


def encode_url_component(text):
    """
    对 URL 组件进行编码，以处理特殊字符。
    """
    return urllib.parse.quote(text, safe='')


def convert_ss(node):
    """
    将 Shadowsocks (ss) 节点转换为 V2RayN 格式。
    格式: ss://base64(method:password@server:port)
    """
    try:
        method = node.get('cipher')
        password = node.get('password')
        server = node.get('server')
        port = node.get('port')
        name = node.get('name', 'ss-node')

        if not all([method, password, server, port]):
            return None

        encoded_str = f"{method}:{password}@{server}:{port}"
        base64_encoded = base64.urlsafe_b64encode(encoded_str.encode('utf-8')).decode('utf-8').rstrip('=')
        return f"ss://{base64_encoded}#{encode_url_component(name)}"
    except Exception as e:
        print(f"转换 Shadowsocks 节点失败: {e}")
        return None


def convert_vmess(node):
    """
    将 Vmess 节点转换为 V2RayN 格式。
    格式: vmess://base64(json_object)
    """
    try:
        v2rayn_node = {
            "v": "2",
            "ps": node.get('name', 'vmess-node'),
            "add": node.get('server'),
            "port": node.get('port'),
            "id": node.get('uuid'),
            "aid": node.get('alterId', 0),
            "scy": node.get('cipher', 'auto'),
            "net": node.get('network', 'tcp'),
            "type": node.get('type', 'none'),
            "host": node.get('host', ''),
            "path": node.get('path', ''),
            "tls": node.get('tls', False),
            "sni": node.get('sni', '')
        }

        if v2rayn_node['tls']:
            v2rayn_node['tls'] = 'tls'

        json_str = json.dumps(v2rayn_node)
        base64_encoded = base64.b64encode(json_str.encode('utf-8')).decode('utf-8')
        return f"vmess://{base64_encoded}"
    except Exception as e:
        print(f"转换 Vmess 节点失败: {e}")
        return None


def convert_vless(node):
    """
    将 Vless 节点转换为 V2RayN 格式。
    格式: vless://uuid@server:port?params#name
    """
    try:
        uuid = node.get('uuid')
        server = node.get('server')
        port = node.get('port')
        name = node.get('name', 'vless-node')

        if not all([uuid, server, port]):
            return None

        params = {}
        if node.get('tls'):
            if node.get('servername'):
                params['sni'] = node.get('servername')

            if node.get('flow') and 'xtls' in node.get('flow'):
                reality_opts = node.get('reality-opts', {})
                params['security'] = 'reality'
                params['flow'] = node.get('flow')
                params['pbk'] = reality_opts.get('public-key')
                if reality_opts.get('short-id'):
                    params['sid'] = reality_opts.get('short-id')
            else:
                params['security'] = 'tls'

        if node.get('network') == 'ws':
            params['type'] = 'ws'
            ws_opts = node.get('ws-opts', {})
            if ws_opts.get('path'):
                params['path'] = ws_opts.get('path')
            if ws_opts.get('headers') and ws_opts.get('headers').get('Host'):
                params['host'] = ws_opts.get('headers').get('Host')

        query_string = urllib.parse.urlencode(params)
        vless_link = f"vless://{uuid}@{server}:{port}"
        if query_string:
            vless_link += f"?{query_string}"
        vless_link += f"#{encode_url_component(name)}"

        return vless_link
    except Exception as e:
        print(f"转换 Vless 节点失败: {e}")
        return None


def convert_trojan(node):
    """
    将 Trojan 节点转换为 V2RayN 格式。
    格式: trojan://password@server:port?params#name
    """
    try:
        password = node.get('password')
        server = node.get('server')
        port = node.get('port')
        name = node.get('name', 'trojan-node')

        if not all([password, server, port]):
            return None

        params = {}
        params['security'] = 'tls'
        if node.get('sni'):
            params['sni'] = node.get('sni')

        if node.get('network') == 'ws':
            params['type'] = 'ws'
            ws_opts = node.get('ws-opts', {})
            if ws_opts.get('path'):
                params['path'] = ws_opts.get('path')
            if ws_opts.get('headers') and ws_opts.get('headers').get('Host'):
                params['host'] = ws_opts.get('headers').get('Host')

        query_string = urllib.parse.urlencode(params)
        trojan_link = f"trojan://{password}@{server}:{port}"
        if query_string:
            trojan_link += f"?{query_string}"
        trojan_link += f"#{encode_url_component(name)}"

        return trojan_link
    except Exception as e:
        print(f"转换 Trojan 节点失败: {e}")
        return None


def convert_hysteria2(node):
    """
    将 Hysteria2 节点转换为 V2RayN 格式。
    格式: hysteria2://password@server:port?params#name
    """
    try:
        password = node.get('password') or node.get('auth')
        server = node.get('server')
        port = node.get('port')
        name = node.get('name', 'hysteria2-node')

        if not all([password, server, port]):
            return None

        params = {}
        params['password'] = password
        if node.get('sni'):
            params['sni'] = node.get('sni')
        if node.get('obfs') == 'salamander' and node.get('obfs-password'):
            params['obfs'] = 'salamander'
            params['obfsParam'] = node.get('obfs-password')

        query_string = urllib.parse.urlencode(params)
        hysteria2_link = f"hysteria2://{server}:{port}"
        if query_string:
            hysteria2_link += f"?{query_string}"
        hysteria2_link += f"#{encode_url_component(name)}"

        return hysteria2_link
    except Exception as e:
        print(f"转换 Hysteria2 节点失败: {e}")
        return None


def convert_http(node):
    """
    将 HTTP 节点转换为 V2RayN 格式。
    格式: http://user:pass@server:port#name
    """
    try:
        server = node.get('server')
        port = node.get('port')
        name = node.get('name', 'http-node')
        username = node.get('username')
        password = node.get('password')

        if not all([server, port]):
            return None

        auth_str = ""
        if username and password:
            auth_str = f"{username}:{password}@"

        return f"http://{auth_str}{server}:{port}#{encode_url_component(name)}"
    except Exception as e:
        print(f"转换 HTTP 节点失败: {e}")
        return None


def main(clash_yml_path, output_file_path=None):
    """
    主函数，读取 Clash YAML 并生成 V2RayN 订阅链接。
    """
    try:
        with open(clash_yml_path, 'r', encoding='utf-8') as f:
            clash_config = yaml.safe_load(f)
    except FileNotFoundError:
        print(f"错误: 文件 '{clash_yml_path}' 未找到。")
        return
    except yaml.YAMLError as e:
        print(f"错误: 解析 YAML 文件时出错: {e}")
        return

    proxies = clash_config.get('proxies')
    if not proxies:
        print("错误: YAML 文件中没有找到 'proxies' 列表。")
        return

    v2rayn_links = []

    print("开始转换节点...")
    for node in proxies:
        node_type = node.get('type')
        converted_link = None

        if node_type == 'ss':
            converted_link = convert_ss(node)
        elif node_type == 'vmess':
            converted_link = convert_vmess(node)
        elif node_type == 'vless':
            converted_link = convert_vless(node)
        elif node_type == 'trojan':
            converted_link = convert_trojan(node)
        elif node_type == 'hysteria2':
            converted_link = convert_hysteria2(node)
        elif node_type == 'http':
            converted_link = convert_http(node)

        if converted_link:
            v2rayn_links.append(converted_link)
            print(f" - 已转换节点: {node.get('name')}")
        else:
            print(f" - 跳过节点: {node.get('name')} (类型: {node_type})")

    if not v2rayn_links:
        print("没有找到可转换的节点。")
        return

    combined_links = "\n".join(v2rayn_links)
    final_subscription = base64.urlsafe_b64encode(combined_links.encode('utf-8')).decode('utf-8').rstrip('=')

    output_path = output_file_path if output_file_path else "s/v2rayn.txt"
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(final_subscription)
        print(f"\n转换完成！结果已成功保存到文件: {output_path}")
    except IOError as e:
        print(f"\n错误: 无法写入文件 '{output_path}': {e}")
        print("\n最终订阅链接 (已 Base64 编码):")
        print("--------------------------------------------------")
        print(final_subscription)
        print("--------------------------------------------------")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python clash_to_v2rayn.py <clash_yml_path> [output_file_path]")
        sys.exit(1)

    clash_yml_path = sys.argv[1]
    output_file_path = sys.argv[2] if len(sys.argv) > 2 else None
    main(clash_yml_path, output_file_path)