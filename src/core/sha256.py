import hashlib

def calculate_content_sha256(content):
    """
    计算字符串或二进制内容的 SHA256 指纹
    :param content: str or bytes
    :return: hex string
    """
    if isinstance(content, str):
        content = content.encode('utf-8')
    
    sha256 = hashlib.sha256()
    sha256.update(content)
    return sha256.hexdigest()

def calculate_file_sha256(file_path):
    """
    计算文件的 SHA256 指纹
    :param file_path: 文件路径
    :return: hex string
    """
    sha256 = hashlib.sha256()
    try:
        with open(file_path, 'rb') as f:
            # 按块读取，避免大文件占用过多内存
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()
    except FileNotFoundError:
        return None