/**
 * Speedtest 插件 - 详细日志与并发控制版
 */
async function operator(proxies = [], targetPlatform, env) {
  const $ = $substore;
  
  const startTime = Date.now();
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

  $.info(`[${getTime()}] [Speedtest] Start --------------------------------------`);

  const http_meta_host = $arguments.http_meta_host || '127.0.0.1';
  const http_meta_port = $arguments.http_meta_port || 9876;
  const timeout = parseInt($arguments.timeout || 500);
  const concurrency = parseInt($arguments.concurrency || 10);

  const http_meta_api = `http://${http_meta_host}:${http_meta_port}`;
  const validProxies = [];
  const uniqueServers = [...new Set(proxies.map(p => p.server).filter(s => s))];
  const serverResults = new Set();

  $.info(`[${getTime()}] [Speedtest] 开始检测. 节点总数: ${proxies.length} (去重后: ${uniqueServers.length}), 并发数: ${concurrency}, 超时设置: ${timeout}ms`);

  async function check(target) {
    try {
      const apiUrl = `${http_meta_api}/ping?server=${target}&timeout=${timeout}`;
      const res = await $.http.get(apiUrl);
      const latency = parseInt(res.body || '0');

      if (latency > 0) {
        $.info(`[${getTime()}] [${target}]: ${latency}ms`);
        serverResults.add(target);
      } else {
        $.info(`[${getTime()}] [${target}]: Timeout`);
      }
    } catch (e) {
      $.error(`[${getTime()}] 检测发生错误: ${e.message || e}`);
    }
  }

  // 2. 参考 http_meta_availability 的并发执行逻辑
  function executeTasks(tasks, concurrencyLimit) {
    return new Promise((resolve) => {
      let running = 0;
      let index = 0;

      function next() {
        // 当还有任务且运行数未达上限时，继续启动
        while (index < tasks.length && running < concurrencyLimit) {
          const taskIndex = index++;
          const task = tasks[taskIndex];
          running++;

          task(taskIndex).finally(() => {
            running--;
            next(); // 任务完成后递归触发下一个
          });
        }

        // 所有任务都已开始且当前没有运行中的任务时结束
        if (running === 0 && index === tasks.length) {
          resolve();
        }
      }

      next();
    });
  }

  // 3. 封装任务并执行
  const tasks = uniqueServers.map(server => () => check(server));
  
  await executeTasks(tasks, concurrency);

  proxies.forEach(proxy => {
    if (serverResults.has(proxy.server)) {
      validProxies.push(proxy);
    }
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  $.info(`[${getTime()}] [Speedtest] 检测完毕. Pass: ${validProxies.length} Fail:${proxies.length}, 总耗时: ${totalTime}s`);

  $.info(`[${getTime()}] [Speedtest] End --------------------------------------`);
 
  return validProxies;
}