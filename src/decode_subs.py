# -*- coding: utf-8 -*-
import base64
import sys
from pathlib import Path

def safe_base64_decode(s):
    """尝试解码 Base64 字符串"""
    if not s: return None
    s = s.strip()
    # 简单的过滤：如果包含空格，通常不是有效的 Base64 订阅串
    if ' ' in s: return None
    
    # URL Safe 处理
    s = s.replace('-', '+').replace('_', '/')
    missing_padding = len(s) % 4
    if missing_padding:
        s += '=' * (4 - missing_padding)
    
    try:
        decoded = base64.b64decode(s).decode('utf-8', errors='ignore')
        # 验证解码后的内容是否看起来像链接列表
        # 只要包含常见协议头，就认为是有效的解码结果
        if any(p in decoded for p in ['vmess://', 'vless://', 'ss://', 'trojan://', 'hysteria']):
            return decoded
        return None
    except Exception:
        return None

def main():
    # 默认读取 config/extra_subs.txt
    project_root = Path(__file__).parent.parent
    default_file = project_root / "config" / "extra_subs.txt"
    
    file_path = default_file
    if len(sys.argv) > 1:
        file_path = Path(sys.argv[1])
        
    if not file_path.is_file():
        print(f"错误: 文件未找到: {file_path}")
        return

    # 读取文件内容
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"错误: 无法读取文件: {e}")
        return
        
    output_path = file_path.with_name("decode_subs.txt")

    print(f"# --- 开始处理文件: {file_path.name} ---")
    print(f"# 正在解析并写入到: {output_path}")
    print("")

    lines = content.splitlines()
    count = 0
    unique_lines = set()
    
    try:
        with open(output_path, 'w', encoding='utf-8') as f_out:
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                    
                # 如果是注释，直接保留
                if line.startswith('#'):
                    f_out.write(line + '\n')
                    continue

                # 1. 检查是否已经是明文链接，如果是直接输出
                if any(line.startswith(p) for p in ['vmess://', 'vless://', 'ss://', 'trojan://', 'hysteria']):
                    f_out.write(line + '\n')
                    count += 1
                    continue
                    
                # 2. 尝试 Base64 解码
                decoded = safe_base64_decode(line)
                if decoded:
                    # Base64 解码后可能包含多行链接
                    sub_lines = decoded.splitlines()
                    for sub_line in sub_lines:
                        sub_line = sub_line.strip()
                        if sub_line:
                            f_out.write(sub_line + '\n')
                            count += 1
                else:
                    # 既不是链接也无法解码，可能是无效内容，作为注释保留
                    pass
    except Exception as e:
        print(f"写入文件失败: {e}")
        return

    print("")
    print(f"# --- 处理完成，共提取出 {count} 个节点链接 ---")
    print(f"# 结果已保存至: {output_path}")


if __name__ == "__main__":
    main()
