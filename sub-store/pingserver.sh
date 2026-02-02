#!/bin/bash
# ================= 配置区 =================
BASE_DIR="/Users/julong/Projects/noderobot/sub-store"
JS_FILE="$BASE_DIR/ping-server.js"
# 优化：使用系统环境变量 TMPDIR，重启自动清理
LOG_FILE="${TMPDIR:-/tmp}ping-server.log"

# 业务参数
PORT=9876
TIMEOUT=500

# 重要：切换到项目根目录
cd "$BASE_DIR" || { echo "❌ 错误：找不到目录 $BASE_DIR"; exit 1; }
# ==========================================

start() {
    if [ ! -f "$JS_FILE" ]; then
        echo "❌ 错误：找不到文件 $JS_FILE"
        return 1
    fi

    if pgrep -f "$JS_FILE" > /dev/null; then
        echo "⚠️  Ping Server 已经在运行中。"
    else
        echo "🚀 正在启动 Ping Server..."
        
        nohup env \
            PORT="$PORT" \
            TIMEOUT="$TIMEOUT" \
            node "$JS_FILE" > "$LOG_FILE" 2>&1 &
            
        sleep 1
        if pgrep -f "$JS_FILE" > /dev/null; then
            echo "✅ 启动成功！"
            echo "🔗 监听端口: $PORT"
            echo "🔗 测试地址: http://127.0.0.1:$PORT/ping?server=1.1.1.1"
        else
            echo "❌ 启动失败，请检查日志: $LOG_FILE"
            tail -n 5 "$LOG_FILE"
        fi
    fi
}

stop() {
    PID=$(pgrep -f "$JS_FILE")
    if [ -z "$PID" ]; then
        echo "ℹ️  没有发现正在运行的 Ping Server 进程。"
    else
        echo "🛑 正在停止 Ping Server (PID: $PID)..."
        kill $PID
        while ps -p $PID > /dev/null; do sleep 1; done
        echo "✅ 已停止。"
    fi
}

status() {
    PID=$(pgrep -f "$JS_FILE")
    if [ -z "$PID" ]; then
        echo "❌ Ping Server 当前状态: 未运行"
    else
        echo "🟢 Ping Server 当前状态: 运行中 (PID: $PID)"
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