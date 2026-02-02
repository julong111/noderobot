#!/bin/bash
# ================= 配置区 =================
BASE_DIR="/Users/julong/Projects/noderobot/sub-store"
FRONTEND_PATH="$BASE_DIR/frontend"
DATA_PATH="$BASE_DIR/data"
BACKEND_JS="$BASE_DIR/sub-store.bundle.js"
# 优化：使用系统环境变量 TMPDIR，重启自动清理
LOG_FILE="${TMPDIR:-/tmp}sub-store.log"

# 业务参数
CUSTOM_PATH="/2cXaAxRGfddmGz2yx1wA"
PORT=3001

# 重要：切换到项目根目录，解决 Node.js 找不到模块的问题
cd "$BASE_DIR" || { echo "❌ 错误：找不到目录 $BASE_DIR"; exit 1; }
# ==========================================

start() {
    # 检查 bundle 文件是否存在，防止配置路径写错
    if [ ! -f "$BACKEND_JS" ]; then
        echo "❌ 错误：找不到文件 $BACKEND_JS"
        return 1
    fi

    if pgrep -f "$BACKEND_JS" > /dev/null; then
        echo "⚠️  Sub-Store 已经在运行中。"
    else
        echo "🚀 正在启动 Sub-Store..."
        mkdir -p "$DATA_PATH"
        
        nohup env \
            SUB_STORE_FRONTEND_BACKEND_PATH="$CUSTOM_PATH" \
            SUB_STORE_BACKEND_API_HOST="0.0.0.0" \
            SUB_STORE_BACKEND_API_PORT="$PORT" \
            SUB_STORE_BACKEND_MERGE=true \
            SUB_STORE_BACKEND_PREFIX=true \
            SUB_STORE_FRONTEND_PATH="$FRONTEND_PATH" \
            SUB_STORE_DATA_BASE_PATH="$DATA_PATH" \
            node "$BACKEND_JS" > "$LOG_FILE" 2>&1 &
            
        sleep 2
        if pgrep -f "$BACKEND_JS" > /dev/null; then
            echo "✅ 启动成功！"
            echo "🔗 前端访问地址: http://127.0.0.1:$PORT$CUSTOM_PATH"
            echo "🔗 自动配置链接: http://127.0.0.1:$PORT?api=http://127.0.0.1:$PORT$CUSTOM_PATH"
        else
            echo "❌ 启动失败，请检查日志: $LOG_FILE"
            # 顺便把最后几行错误打出来，方便排查
            tail -n 5 "$LOG_FILE"
        fi
    fi
}

stop() {
    PID=$(pgrep -f "$BACKEND_JS")
    if [ -z "$PID" ]; then
        echo "ℹ️  没有发现正在运行的 Sub-Store 进程。"
    else
        echo "🛑 正在停止 Sub-Store (PID: $PID)..."
        kill $PID
        while ps -p $PID > /dev/null; do sleep 1; done
        echo "✅ 已停止。"
    fi
}

status() {
    PID=$(pgrep -f "$BACKEND_JS")
    if [ -z "$PID" ]; then
        echo "❌ Sub-Store 当前状态: 未运行"
    else
        echo "🟢 Sub-Store 当前状态: 运行中 (PID: $PID)"
    fi
}

log() {
    tail -f "$LOG_FILE"
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; start ;;
    status) status ;;
    log) log ;;
    *) echo "用法: $0 {start|stop|restart|status|log}"; exit 1 ;;
esac