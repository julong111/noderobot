/**
 * Speedtest 插件 - 详细日志与并发控制版
 */
async function operator(proxies = [], targetPlatform, env) {
  const { log, performance, csv } = $substore.julong;
  const ping = require('ping'); // 添加这行引入 ping 模块

  const startTime = Date.now();

  log.info('Speedtest', 'Start --------------------------------------');

  // CSV 统计功能
  const csvDbPath = $arguments.csv_path || '/Users/julong/Projects/noderobot/s/node-connective.csv';
  const csvColumns = ['ip', 'port', 'protocol', 'pass', 'notpass', 'firsttime', 'updatetime'];

  const timeout = parseInt($arguments.timeout || 1000);
  const concurrency = parseInt($arguments.concurrency || 10);

  const validProxies = [];
  const uniqueServers = [...new Set(proxies.map(p => p.server).filter(s => s))];
  const serverResults = new Set();
  const totalTasks = uniqueServers.length;
  let processedCount = 0;
  
  // 统计变量初始化
  let minLatency = Infinity;
  let maxLatency = 0;
  let successCount = 0;
  let timeoutCount = 0;

  log.info('Speedtest', `开始检测. 节点总数: ${proxies.length} (去重后: ${totalTasks}), 并发数: ${concurrency}, 超时设置: ${timeout}ms`);

  // 预读取 CSV 数据到内存，避免每次检测都读取文件
  let historyMap = new Map();
  try {
    const csvData = await csv.read(csvDbPath);
    csvData.forEach(row => {
      // 构建唯一键用于快速查找
      const key = `${row.ip},${row.port},${row.protocol}`;
      historyMap.set(key, row);
    });
  } catch (e) {
    log.error('Speedtest', `读取历史CSV失败: ${e.message}`);
  }

  // 从内存中获取旧通过率 (同步函数)
  function getOldPassRate(ip, port, protocol) {
      const key = `${ip},${port},${protocol}`;
      const serverData = historyMap.get(key);

      if (serverData) {
        const passCount = parseInt(serverData.pass) || 0;
        const notPassCount = parseInt(serverData.notpass) || 0;
        const totalCount = passCount + notPassCount;
        
        if (totalCount > 0) {
          const oldPassRate = ((passCount / totalCount) * 100).toFixed(2);
          return { passRate: oldPassRate, totalCount };
        }
      }
      return { passRate: '0.00', totalCount: 0 };
  }

  // 构建 server -> proxy 映射，用于快速查找端口和协议
  const serverToProxyMap = new Map();
  proxies.forEach(p => {
    if (p.server && !serverToProxyMap.has(p.server)) {
      serverToProxyMap.set(p.server, p);
    }
  });

  async function check(targetServer) {
    processedCount++;
    try {
      // 获取旧的通过率信息
      const proxyNode = serverToProxyMap.get(targetServer);
      const port = proxyNode ? proxyNode.port : '';
      const protocol = proxyNode ? (proxyNode.type || 'unknown') : '';
      const oldStats = getOldPassRate(targetServer, port, protocol);
      
      // 平台适配：Windows 用 ms，macOS/Linux 用秒
      const isWin = eval('process.platform === "win32"');
      const timeoutValue = isWin ? timeout : timeout / 1000;

      const res = await ping.promise.probe(targetServer, {
        timeout: timeoutValue,
      });
      const latency = res.alive ? Math.round(parseFloat(res.time)) : 0;

      if (latency > 0) {
        successCount++;
        if (latency < minLatency) minLatency = latency;
        if (latency > maxLatency) maxLatency = latency;
        
        log.columns('Speedtest', [
          { text: `[${processedCount}/${totalTasks}]`, width: 10 },
          { text: `[${targetServer}]`, width: 30 },
          { text: `${latency}ms`, width: 5, align: 'right' },
          { text: `总: ${oldStats.totalCount}`, width: 5, align: 'right' },
          { text: ` 通过率: ${oldStats.passRate}% ` }
        ]);
        serverResults.add(targetServer);
      } 
      else {
        timeoutCount++;
        log.columns('Speedtest', [
          { text: `[${processedCount}/${totalTasks}]`, width: 10 },
          { text: `[${targetServer}]`, width: 30 },
          { text: `Timeout`, width: 5, align: 'right' },
          { text: `总: ${oldStats.totalCount}`, width: 5, align: 'right' },
          { text: ` 通过率: ${oldStats.passRate}% ` }
        ]);
      }
    } catch (e) {
      timeoutCount++;
      log.error('Speedtest', `[${processedCount}/${totalTasks}] [${targetServer}] 检测发生错误: ${e.message || e}`);
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

  // 计算统计结果
  const passRate = totalTasks > 0 ? ((successCount / totalTasks) * 100).toFixed(2) : '0.00';
  const displayMin = minLatency === Infinity ? 0 : minLatency;

  log.info('Speedtest', '总结 --------------------------------------');
  log.info('Speedtest', `总检测节点: ${totalTasks}`);
  log.info('Speedtest', `成功: ${successCount}, 超时/失败: ${timeoutCount}`);
  log.info('Speedtest', `最小延时: ${displayMin}ms, 最大延时: ${maxLatency}ms`);
  log.info('Speedtest', `通过率: ${passRate}%`);
  log.info('Speedtest', '-------------------------------------------');

  // 使用 for...of 和 await 修复并发写入CSV的bug
  for (const proxy of proxies) {
    const isPass = serverResults.has(proxy.server);
    if (isPass) {
      validProxies.push(proxy);
    }

    // 更新 CSV 统计 - 使用公共CSV工具函数
    if (!proxy.server || !proxy.port) continue;

    const protocol = proxy.type || 'unknown';
    const currentTime = performance.getTime();
    const item = {
      ip: proxy.server,
      port: proxy.port,
      protocol: protocol,
      pass: isPass ? 1 : 0,
      notpass: isPass ? 0 : 1,
      firsttime: currentTime,
      updatetime: currentTime
    };

    try {
      await csv.operate(
        csvDbPath, item,
        (existing, current) => {
          if (existing) {
            return { ...current,
              pass: (parseInt(existing.pass) || 0) + current.pass,
              notpass: (parseInt(existing.notpass) || 0) + current.notpass,
              firsttime: existing.firsttime // 保留首次记录时间
            };
          }
          return current; // 新记录
        }
      , csvColumns, ['ip', 'port', 'protocol']);
    } catch (e) {
      log.error('Speedtest', `CSV 更新失败 for ${proxy.server}: ${e.message}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  log.info('Speedtest', `检测完毕. Pass: ${validProxies.length} Fail:${proxies.length}, 总耗时: ${totalTime}s`);

  log.info('Speedtest', 'End --------------------------------------');
 
  return proxies;
}