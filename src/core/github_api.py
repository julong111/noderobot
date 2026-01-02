# -*- coding: utf-8 -*-
import re
import logging
from typing import Optional, Dict, Any, List
from .network import NetworkClient

logger = logging.getLogger('GitHubAPI')

class GitHubClient:
    """
    GitHub API 交互客户端。
    """
    def __init__(self, token: Optional[str] = None, network_client: Optional[NetworkClient] = None):
        self.token = token
        self.client = network_client or NetworkClient()

    def _get_headers(self) -> Dict[str, str]:
        headers = {'Accept': 'application/vnd.github.v3+json'}
        if self.token:
            headers['Authorization'] = f"token {self.token}"
        return headers

    def list_files(self, repo: str) -> List[Dict[str, Any]]:
        """
        获取 GitHub 仓库根目录下的文件列表。
        """
        api_url = f"https://api.github.com/repos/{repo}/contents/"
        logger.info(f"正在查询 GitHub API: {api_url}")

        try:
            response = self.client.get(api_url, headers=self._get_headers())
            data = response.json()
            if isinstance(data, list):
                logger.info(f"成功获取文件列表，共 {len(data)} 个文件。")
                return data
            else:
                logger.warning(f"GitHub API 返回了非列表数据: {data}")
                return []
        except Exception as e:
            logger.error(f"GitHub API 请求失败: {e}")
            return []

    def find_latest_file(self, repo: str, file_pattern: str) -> Optional[Dict[str, Any]]:
        """
        在 GitHub 仓库中查找符合正则模式的最新文件。
        """
        files = self.list_files(repo)
        if not files:
            logger.warning(f"仓库 {repo} 文件列表为空或获取失败。")
            return None

        matched_files = []
        for file_info in files:
            if not isinstance(file_info, dict) or file_info.get('type') != 'file':
                continue

            name = file_info.get('name', '')
            if re.match(file_pattern, name):
                if file_info.get('size', 0) > 0:
                    matched_files.append({
                        'name': name,
                        'sha': file_info.get('sha'),
                        'download_url': file_info.get('download_url')
                    })
                else:
                    logger.warning(f"跳过匹配但为空的文件: {name}")

        if not matched_files:
            logger.warning(f"在仓库 {repo} 中未找到匹配 '{file_pattern}' 的有效(非空)文件。")
            all_filenames = [f.get('name') for f in files if isinstance(f, dict) and f.get('name')]
            logger.info(f"仓库中现有的文件: {all_filenames}")
            return None

        # 按文件名降序排序（通常文件名包含日期），获取最新的一个
        latest = sorted(matched_files, key=lambda x: x['name'], reverse=True)[0]
        logger.info(f"找到最新的有效配置文件: {latest.get('name')}")
        return latest

    def fetch_content(self, url: str) -> Optional[str]:
        """
        下载文件内容，自动携带认证 Token。
        """
        return self.client.fetch_text(url, headers=self._get_headers())