#!/bin/bash

# ====================================================
# 1. 代理配置 (在此处修改你的本地代理)
# ====================================================
# 如果是 HTTP 代理，格式为 http://127.0.0.1:端口
# 如果是 SOCKS5 代理，建议使用 socks5h://127.0.0.1:端口 (h 表示由代理进行 DNS 解析)
USE_PROXY="true"
PROXY_URL="http://127.0.0.1:7890"

# ====================================================
# 2. 路径与下载配置
# ====================================================
# 数据库保存路径：脚本所在目录的 ../config/City.mmdb
BASE_DIR=$(cd "$(dirname "$0")"; pwd)
TARGET_DIR="$BASE_DIR/../config"
TARGET_FILE="City.mmdb"

# P3TERX 维护的直接下载地址
URL="https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-City.mmdb"

# ====================================================
# 3. 脚本逻辑
# ====================================================

# 确保目标目录存在
mkdir -p "$TARGET_DIR"

# 准备 curl 参数
CURL_ARGS="-Lf"
if [ "$USE_PROXY" = "true" ] && [ -n "$PROXY_URL" ]; then
    CURL_ARGS="$CURL_ARGS -x $PROXY_URL"
    echo "提示：已启用代理 $PROXY_URL"
fi

echo "正在下载最新数据库到: $TARGET_DIR/$TARGET_FILE"

# 使用临时文件下载
TEMP_FILE="/tmp/GeoLite2-City.mmdb"

# 执行下载
if curl $CURL_ARGS "$URL" -o "$TEMP_FILE"; then
    mv "$TEMP_FILE" "$TARGET_DIR/$TARGET_FILE"
    
    echo "--------------------------------------------"
    echo "更新成功！"
    echo "最终位置: $(realpath "$TARGET_DIR/$TARGET_FILE")"
    echo "文件大小: $(du -sh "$TARGET_DIR/$TARGET_FILE" | cut -f1)"
    echo "更新时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo "--------------------------------------------"
else
    echo "--------------------------------------------"
    echo "错误：下载失败！"
    echo "请检查："
    echo "1. 代理地址 $PROXY_URL 是否正确且已开启"
    echo "2. 网络是否能访问 GitHub"
    echo "--------------------------------------------"
    [ -f "$TEMP_FILE" ] && rm "$TEMP_FILE"
    exit 1
fi