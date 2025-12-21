# -*- coding: utf-8 -*-
import logging
import sys
from pathlib import Path
from typing import Optional

def setup_logger(name: Optional[str] = None, level: int = logging.INFO) -> logging.Logger:
    """
    配置并返回一个 logger 实例。
    
    Args:
        name: Logger 名称。如果为 None，则配置根 Logger (RootLogger)。
        level: 日志级别
    """
    logger = logging.getLogger(name)
    
    # 如果 logger 已经有 handler，说明已经被配置过，直接返回
    if logger.hasHandlers():
        return logger
        
    logger.setLevel(level)

    # 创建控制台处理器
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)

    # 定义日志格式
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    console_handler.setFormatter(formatter)

    logger.addHandler(console_handler)
    return logger