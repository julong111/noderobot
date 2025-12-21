# -*- coding: utf-8 -*-
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Optional, Dict, Any
import logging

logger = logging.getLogger('Network')

class NetworkClient:
    """
    通用网络请求客户端，封装了 requests 库，支持重试和超时设置。
    """
    def __init__(self, timeout: int = 20, retries: int = 3, headers: Optional[Dict[str, str]] = None):
        self.timeout = timeout
        self.session = requests.Session()
        
        # 配置重试策略
        retry_strategy = Retry(
            total=retries,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["HEAD", "GET", "OPTIONS"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)
        
        # 设置默认 Headers
        default_headers = {'User-Agent': 'NodeRobot/1.0'}
        if headers:
            default_headers.update(headers)
        self.session.headers.update(default_headers)

    def get(self, url: str, params: Optional[Dict] = None, headers: Optional[Dict] = None, **kwargs) -> requests.Response:
        """
        发起 GET 请求。
        """
        kwargs.setdefault('timeout', self.timeout)
        try:
            response = self.session.get(url, params=params, headers=headers, **kwargs)
            response.raise_for_status()
            return response
        except requests.RequestException as e:
            logger.error(f"请求失败 [{url}]: {e}")
            raise

    def fetch_text(self, url: str, **kwargs) -> Optional[str]:
        """
        下载 URL 内容并返回文本。如果失败返回 None。
        """
        try:
            response = self.get(url, **kwargs)
            return response.text
        except requests.RequestException:
            return None