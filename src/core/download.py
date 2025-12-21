# -*- coding: utf-8 -*-
import logging
from typing import Optional
import config
from .network import NetworkClient

logger = logging.getLogger('Download')

def fetch_and_save_source(name: str, url: str, client: NetworkClient) -> Optional[str]:
    """
    获取源内容（URL或本地文件），并保存原始文件到 sources 目录。
    """
    content = ""
    if url.startswith(('http://', 'https://')):
        content = client.fetch_text(url)
        if content:
            logger.info(f"  - 已从URL下载内容 ({len(content)} 字符)。")

            # 保存下载的原始文件
            try:
                original_output_dir = config.ORIGINAL_DATA_DIR
                original_output_dir.mkdir(parents=True, exist_ok=True)
                source_filename = f"{name}-original.yml"
                source_output_path = original_output_dir / source_filename
                source_output_path.write_text(content, encoding='utf-8')
                logger.info(f"  - 原始来源文件已保存到: {source_output_path}")
            except Exception as e:
                logger.warning(f"  - 保存原始文件失败: {e}")
        else:
            logger.warning(f"  - 从URL下载失败，已跳过此来源。")
            return None
    else:
        # 处理本地文件路径
        file_path = config.SRC_DIR / url
        if file_path.is_file():
            try:
                content = file_path.read_text(encoding='utf-8')
                logger.info(f"  - 已读取本地文件内容 ({len(content)} 字符)。")
            except Exception as e:
                logger.warning(f"  - 读取本地文件 {file_path} 失败: {e}，已跳过此来源。")
                return None
        else:
            logger.warning(f"  - 本地文件未找到 -> {file_path}，已跳过此来源。")
            return None

    return content