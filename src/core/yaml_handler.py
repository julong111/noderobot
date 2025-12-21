# -*- coding: utf-8 -*-
import sys
import yaml
from pathlib import Path

# --- 自定义 YAML 类型与 Dumper ---

class FlowStyleDict(dict):
    """用于标记需要以单行风格（flow style）输出的字典"""
    pass

class SingleQuotedString(str):
    """用于标记需要以单引号风格输出的字符串"""
    pass

class NoAliasDumper(yaml.SafeDumper):
    """使用自定义的Dumper来避免产生YAML锚点和别名"""
    def ignore_aliases(self, data):
        return True

class IndentedDumper(NoAliasDumper):
    """自定义Dumper以修复列表项的缩进问题"""
    def increase_indent(self, flow=False, indentless=False):
        # 强制为非flow的序列（列表）增加缩进
        return super(IndentedDumper, self).increase_indent(flow, False)

# 注册 Representers
def flow_style_dict_representer(dumper, data):
    return dumper.represent_mapping('tag:yaml.org,2002:map', data, flow_style=True)

def single_quoted_string_representer(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style="'")

NoAliasDumper.add_representer(FlowStyleDict, flow_style_dict_representer)
IndentedDumper.add_representer(SingleQuotedString, single_quoted_string_representer)


# --- 核心 IO 函数 ---

def load_yaml_file(file_path: Path, exit_on_error: bool = True) -> dict:
    """
    安全地加载并解析一个YAML文件。

    Args:
        file_path: YAML文件的路径。
        exit_on_error: 如果文件未找到或解析失败，是否退出程序。

    Returns:
        解析后的Python字典。
    """
    print(f"正在加载文件: {file_path}")
    if not file_path.is_file():
        if exit_on_error:
            print(f"错误: 文件未找到 -> {file_path}", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"警告: 文件未找到 -> {file_path}，返回空配置。")
            return {}

    try:
        with file_path.open('r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    except yaml.YAMLError as e:
        if exit_on_error:
            print(f"错误: 解析YAML文件 {file_path} 失败: {e}", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"警告: 解析YAML文件 {file_path} 失败: {e}，返回空配置。")
            return {}
    except Exception as e:
        if exit_on_error:
            print(f"错误: 读取文件 {file_path} 失败: {e}", file=sys.stderr)
            sys.exit(1)
        else:
            print(f"警告: 读取文件 {file_path} 失败: {e}，返回空配置。")
            return {}

def load_yaml_from_string(content: str, source_name: str) -> dict:
    """
    从字符串内容中安全地加载并解析YAML。

    Args:
        content: 包含YAML内容的字符串。
        source_name: 来源名称，用于日志记录。

    Returns:
        解析后的Python字典。
    """
    if not content:
        print(f"警告: 来自 '{source_name}' 的内容为空，返回空配置。")
        return {}
    try:
        return yaml.safe_load(content)
    except yaml.YAMLError as e:
        print(f"警告: 解析来自 '{source_name}' 的YAML内容失败: {e}，返回空配置。")
        return {}
    except Exception as e:
        print(f"警告: 处理来自 '{source_name}' 的内容时发生未知错误: {e}，返回空配置。")
        return {}

def save_yaml_file(data: dict, file_path: Path):
    """
    将Python字典保存为YAML文件。

    Args:
        data: 要保存的字典数据。
        file_path: 输出文件的路径。
    """
    print(f"正在保存合并后的配置文件到: {file_path}")
    try:
        # 确保目标目录存在，如果不存在则创建
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with file_path.open('w', encoding='utf-8') as f:
            yaml.dump(
                data,
                f,
                Dumper=IndentedDumper,
                allow_unicode=True,
                sort_keys=False,
                indent=2,
                width=9999
            )
        print("保存成功。")
    except Exception as e:
        print(f"错误: 写入文件 {file_path} 失败: {e}", file=sys.stderr)
        sys.exit(1)