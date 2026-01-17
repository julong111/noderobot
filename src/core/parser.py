# -*- coding: utf-8 -*-
import base64
import json
import urllib.parse
import re

def safe_base64_decode(s):
    """安全的 Base64 解码"""
    if not s: return ""
    s = s.strip().replace('-', '+').replace('_', '/')
    missing_padding = len(s) % 4
    if missing_padding:
        s += '=' * (4 - missing_padding)
    try:
        return base64.b64decode(s).decode('utf-8', errors='ignore')
    except:
        return ""

def safe_base64_encode(s):
    """Base64 编码 (URL Safe)"""
    if not s: return ""
    return base64.b64encode(s.encode('utf-8')).decode('utf-8').replace('+', '-').replace('/', '_').replace('=', '')

# --- 解析逻辑 (Link -> Dict) ---

def parse_vmess(vmess_url):
    """解析 vmess:// 链接"""
    try:
        b64_str = vmess_url.replace("vmess://", "")
        data = json.loads(safe_base64_decode(b64_str))
        node = {
            'name': data.get('ps', 'vmess'),
            'type': 'vmess',
            'server': data.get('add'),
            'port': int(data.get('port')),
            'uuid': data.get('id'),
            'alterId': int(data.get('aid', 0)),
            'cipher': 'auto',
            'tls': True if data.get('tls') == 'tls' else False,
            'network': data.get('net', 'tcp')
        }
        if node['network'] == 'ws':
            node['ws-opts'] = {'path': data.get('path', '/')}
            if data.get('host'):
                node['ws-opts']['headers'] = {'Host': data.get('host')}
        if data.get('sni'):
            node['servername'] = data.get('sni')
        return node
    except:
        return None

def parse_ss(ss_url):
    """解析 ss:// 链接"""
    try:
        body = ss_url.replace("ss://", "")
        remark = ""
        if '#' in body:
            body, remark = body.split('#', 1)
            remark = urllib.parse.unquote(remark)
        
        if '@' in body:
            user_info_b64, server_part = body.split('@', 1)
            user_info = safe_base64_decode(user_info_b64)
            if ':' in user_info:
                method, password = user_info.split(':', 1)
            else:
                return None
        else:
            decoded = safe_base64_decode(body)
            if '@' in decoded:
                user_info, server_part = decoded.split('@', 1)
                method, password = user_info.split(':', 1)
            else:
                return None
            
        server, port = server_part.split(':', 1)
        return {
            'name': remark if remark else f"ss-{server}",
            'type': 'ss',
            'server': server,
            'port': int(port),
            'cipher': method,
            'password': password
        }
    except:
        return None

def parse_trojan(trojan_url):
    """解析 trojan:// 链接"""
    try:
        parsed = urllib.parse.urlparse(trojan_url)
        node = {
            'name': urllib.parse.unquote(parsed.fragment) if parsed.fragment else f"trojan-{parsed.hostname}",
            'type': 'trojan',
            'server': parsed.hostname,
            'port': parsed.port,
            'password': parsed.username,
            'skip-cert-verify': True
        }
        query = urllib.parse.parse_qs(parsed.query)
        if 'sni' in query:
            node['sni'] = query['sni'][0]
        return node
    except:
        return None

def parse_vless(vless_url):
    """解析 vless:// 链接"""
    try:
        parsed = urllib.parse.urlparse(vless_url)
        query = urllib.parse.parse_qs(parsed.query)
        
        node = {
            'name': urllib.parse.unquote(parsed.fragment) if parsed.fragment else f"vless-{parsed.hostname}",
            'type': 'vless',
            'server': parsed.hostname,
            'port': parsed.port,
            'uuid': parsed.username,
            'tls': True if query.get('security', [''])[0] in ['tls', 'reality'] else False,
            'network': query.get('type', ['tcp'])[0],
            'udp': True,
            'skip-cert-verify': True
        }
        
        if 'flow' in query:
            node['flow'] = query['flow'][0]
        
        if 'sni' in query:
            node['servername'] = query['sni'][0]
            
        # Reality 支持
        if query.get('security', [''])[0] == 'reality':
            node['reality-opts'] = {}
            if 'pbk' in query: node['reality-opts']['public-key'] = query['pbk'][0]
            if 'sid' in query: node['reality-opts']['short-id'] = query['sid'][0]
            
        if 'fp' in query:
            node['client-fingerprint'] = query['fp'][0]

        if node['network'] == 'ws':
            ws_opts = {'path': query.get('path', ['/'])[0]}
            if 'host' in query:
                ws_opts['headers'] = {'Host': query['host'][0]}
            node['ws-opts'] = ws_opts
        
        if node['network'] == 'grpc':
            grpc_opts = {}
            if 'serviceName' in query:
                grpc_opts['grpc-service-name'] = query['serviceName'][0]
            if 'mode' in query:
                grpc_opts['grpc-mode'] = query['mode'][0]
            node['grpc-opts'] = grpc_opts
            
        return node
    except:
        return None

def parse_content(content):
    """通用解析入口"""
    nodes = []
    # 既然明确是节点列表，直接按行处理
    lines = content.splitlines()

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#'): continue
        
        node = None
        if line.startswith("vmess://"): node = parse_vmess(line)
        elif line.startswith("ss://"): node = parse_ss(line)
        elif line.startswith("trojan://"): node = parse_trojan(line)
        elif line.startswith("vless://"): node = parse_vless(line)
        
        if node: nodes.append(node)
    return nodes

# --- 生成逻辑 (Dict -> Link) ---

def to_vmess(p):
    try:
        d = {
            "v": "2",
            "ps": p.get('name', 'vmess'),
            "add": p.get('server'),
            "port": str(p.get('port')),
            "id": p.get('uuid'),
            "aid": str(p.get('alterId', 0)),
            "net": p.get('network', 'tcp'),
            "type": "none",
            "host": "",
            "path": "",
            "tls": "tls" if p.get('tls') else ""
        }
        if p.get('network') == 'ws':
            ws_opts = p.get('ws-opts', {})
            d['path'] = ws_opts.get('path', '/')
            d['host'] = ws_opts.get('headers', {}).get('Host', '')
        if p.get('servername'):
            d['sni'] = p.get('servername')
            if not d['host']: d['host'] = d['sni']
        return "vmess://" + safe_base64_encode(json.dumps(d))
    except: return None

def to_ss(p):
    try:
        user_info = f"{p['cipher']}:{p['password']}"
        user_info_b64 = safe_base64_encode(user_info)
        link = f"ss://{user_info_b64}@{p['server']}:{p['port']}"
        return link + "#" + urllib.parse.quote(str(p.get('name', 'ss')))
    except: return None

def to_trojan(p):
    try:
        query = {}
        if p.get('sni'): query['sni'] = p['sni']
        q_str = urllib.parse.urlencode(query)
        link = f"trojan://{p['password']}@{p['server']}:{p['port']}"
        if q_str: link += f"?{q_str}"
        return link + "#" + urllib.parse.quote(str(p.get('name', 'trojan')))
    except: return None

def to_vless(p):
    try:
        query = {
            'type': p.get('network', 'tcp'),
            'security': 'tls' if p.get('tls') else 'none'
        }
        if p.get('flow'): query['flow'] = p['flow']
        if p.get('servername'): query['sni'] = p['servername']
        if p.get('client-fingerprint'): query['fp'] = p['client-fingerprint']
        
        # Reality
        if p.get('reality-opts'):
            query['security'] = 'reality'
            if p['reality-opts'].get('public-key'): query['pbk'] = p['reality-opts']['public-key']
            if p['reality-opts'].get('short-id'): query['sid'] = p['reality-opts']['short-id']

        if p.get('network') == 'ws':
            ws_opts = p.get('ws-opts', {})
            query['path'] = ws_opts.get('path', '/')
            if ws_opts.get('headers', {}).get('Host'):
                query['host'] = ws_opts['headers']['Host']
        
        if p.get('network') == 'grpc':
             grpc_opts = p.get('grpc-opts', {})
             if grpc_opts.get('grpc-service-name'): query['serviceName'] = grpc_opts['grpc-service-name']
             if grpc_opts.get('grpc-mode'): query['mode'] = grpc_opts['grpc-mode']

        q_str = urllib.parse.urlencode(query)
        link = f"vless://{p['uuid']}@{p['server']}:{p['port']}?{q_str}"
        return link + "#" + urllib.parse.quote(str(p.get('name', 'vless')))
    except: return None

def generate_v2ray_sub(proxies):
    """生成 V2Ray 订阅内容 (Base64)"""
    links = []
    for p in proxies:
        link = None
        ptype = p.get('type')
        if ptype == 'vmess': link = to_vmess(p)
        elif ptype == 'ss': link = to_ss(p)
        elif ptype == 'trojan': link = to_trojan(p)
        elif ptype == 'vless': link = to_vless(p)
        
        if link:
            links.append(link)
            
    return safe_base64_encode("\n".join(links))
