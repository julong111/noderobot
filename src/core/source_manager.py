# -*- coding: utf-8 -*-
import json
import logging
import sys
from pathlib import Path

from core.network import NetworkClient
from core.download import fetch_and_save_source
from core.sha256 import calculate_content_sha256
from core.yaml_handler import load_yaml_from_string

logger = logging.getLogger("Core.SourceManager")

def load_and_update_sources(sources_path: Path) -> list[dict]:
    """
    从sources文件指定的来源加载所有代理，并更新SHA256校验和。
    """
    if not sources_path.is_file():
        logger.error(f"代理来源文件未找到 -> {sources_path}")
        sys.exit(1)

    logger.info(f"正在从 {sources_path.name} 加载代理来源")
    try:
        with sources_path.open('r', encoding='utf-8') as f:
            sources = json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"解析JSON文件 {sources_path} 失败: {e}")
        sys.exit(1)

    client = NetworkClient()
    all_proxies = []
    has_updates = False

    for source in sources:
        name = source.get('name', '未命名来源')
        url = source.get('url')
        if not url:
            logger.warning(f"来源 '{name}'缺少 'url'，已跳过。")
            continue

        logger.info(f"正在处理来源: {name} ({url})")
        content = fetch_and_save_source(name, url, client)
        if not content:
            continue

        # 计算并比对 SHA256
        # 统一将 CRLF 替换为 LF，避免跨平台（Windows/Linux）导致的文件换行符差异影响 SHA 计算
        normalized_content = content.replace('\r\n', '\n')
        current_sha256 = calculate_content_sha256(normalized_content)
        stored_sha256 = source.get('sha256', '')

        if current_sha256 != stored_sha256:
            logger.info(f"  - 来源 '{name}' 内容有更新 (SHA256变动)。")
            source['sha256'] = current_sha256
            has_updates = True
        else:
            logger.info(f"  - 来源 '{name}' 内容无变化。")

        data = load_yaml_from_string(content, name)
        proxies = data.get('proxies', []) or []
        logger.info(f"  - 从 '{name}' 找到 {len(proxies)} 个代理。")
        all_proxies.extend(proxies)

    if has_updates:
        return all_proxies, sources, True
    
    return all_proxies, sources, False