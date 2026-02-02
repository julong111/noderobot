const http = require('http');
const ping = require('ping');

// --- 默认配置 ---
const DEFAULT_PORT = 9876;
const DEFAULT_TIMEOUT_MS = 500;

// 获取启动参数
// 优先级：命令行参数 (node ping-server.js 8888) > 环境变量 (PORT) > 默认值
const args = process.argv.slice(2);
const PORT = parseInt(args[0]) || parseInt(process.env.PORT) || DEFAULT_PORT;
const GLOBAL_DEFAULT_TIMEOUT = parseInt(process.env.TIMEOUT) || DEFAULT_TIMEOUT_MS;

const getTime = (() => {
  let lastSecond = 0;
  let cachedPrefix = '';

  return () => {
    const now = Date.now();
    const ms = now % 1000;
    const second = (now / 1000) | 0; // 使用位运算进行取整，比 Math.floor 快

    // 只有当秒数变化时才重新计算前缀
    if (second !== lastSecond) {
      lastSecond = second;
      const d = new Date(now);
      const m = d.getMonth() + 1;
      const date = d.getDate();
      const h = d.getHours();
      const min = d.getMinutes();
      const s = d.getSeconds();

      // 字符串拼接在 V8 中会被优化
      cachedPrefix = d.getFullYear() + '-' +
        (m < 10 ? '0' + m : m) + '-' +
        (date < 10 ? '0' + date : date) + ' ' +
        (h < 10 ? '0' + h : h) + ':' +
        (min < 10 ? '0' + min : min) + ':' +
        (s < 10 ? '0' + s : s);
    }

    // 处理毫秒补零
    if (ms < 10) return cachedPrefix + '.00' + ms;
    if (ms < 100) return cachedPrefix + '.0' + ms;
    return cachedPrefix + '.' + ms;
  };
})();

/**
 * 创建 HTTP 服务
 */
const server = http.createServer(async (req, res) => {
    // 使用 WHATWG URL API 解析请求
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    
    if (requestUrl.pathname === '/ping') {
        const serverParam = requestUrl.searchParams.get('server');
        // 动态接收 API 调用时传入的超时参数
        const apiTimeoutParam = requestUrl.searchParams.get('timeout');
        
        // 确定本次请求的超时时间
        const finalTimeoutMs = apiTimeoutParam ? parseInt(apiTimeoutParam) : GLOBAL_DEFAULT_TIMEOUT;

        // 设置响应头：200 状态码，纯文本格式
        res.writeHead(200, { 'Content-Type': 'text/plain' });

        if (!serverParam) {
            return res.end('0');
        }

        try {
            // 平台适配：Windows 用 ms，macOS/Linux 用秒
            const isWin = process.platform === 'win32';
            const timeoutValue = isWin ? finalTimeoutMs : finalTimeoutMs / 1000;

            const result = await ping.promise.probe(serverParam, {
                timeout: timeoutValue,
            });

            // 返回延迟数字，失败或不通返回 0
            const delay = result.alive ? Math.round(parseFloat(result.time)).toString() : '0';
            
            console.log(`[${getTime()}] Host: ${serverParam} | Delay: ${delay}ms`);
            res.end(delay);
        } catch (error) {
            console.error(`[${getTime()}] Ping Error:`, error);
            res.end('0');
        }
    } else {
        res.writeHead(404);
        res.end();
    }
});

// 启动监听
server.listen(PORT, () => {
    console.log(`[${getTime()}] ---------------------------------------`);
    console.log(`[${getTime()}] 极简 Ping 服务启动成功`);
    console.log(`[${getTime()}] 监听端口: ${PORT}`);
    console.log(`[${getTime()}] 全局默认超时: ${GLOBAL_DEFAULT_TIMEOUT}ms`);
    console.log(`[${getTime()}] ---------------------------------------`);
});