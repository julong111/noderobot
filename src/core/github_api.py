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
            return data if isinstance(data, list) else []
        except Exception as e:
            logger.error(f"GitHub API 请求失败: {e}")
            return []

    def find_latest_file(self, repo: str, file_pattern: str) -> Optional[Dict[str, Any]]:
        """
        在 GitHub 仓库中查找符合正则模式的最新文件。
        """
        files = self.list_files(repo)
        if not files:
            return None

        matched_files = []
        for file_info in files:
            if isinstance(file_info, dict) and file_info.get('type') == 'file' and re.match(file_pattern, file_info.get('name', '')):
                matched_files.append({
                    'name': file_info['name'],
                    'sha': file_info['sha'],
                    'download_url': file_info['download_url']
                })

        if not matched_files:
            logger.warning(f"在仓库 {repo} 中未找到匹配 '{file_pattern}' 的文件。")
            return None

        # 按文件名降序排序（通常文件名包含日期），获取最新的一个
        latest = sorted(matched_files, key=lambda x: x['name'], reverse=True)[0]
        return latest

    def fetch_content(self, url: str) -> Optional[str]:
        """
        下载文件内容，自动携带认证 Token。
        """
        return self.client.fetch_text(url, headers=self._get_headers())