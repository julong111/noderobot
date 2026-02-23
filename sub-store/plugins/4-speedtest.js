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

  // CSV 统计功能
  const fs = eval('require("fs")');
  const ping = eval('require("ping")');
  const csvDbPath = $arguments.csv_path || '/Users/julong/Projects/noderobot/s/node-connective.csv';

  function loadCsvDb(filePath) {
    const db = {};
    if (!fs.existsSync(filePath)) return db;
    try {
      let content = fs.readFileSync(filePath, 'utf8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // Strip BOM
      const lines = content.split(/\r?\n/);
      for (let i = 1; i < lines.length; i++) { // Skip header
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        if (parts.length >= 7) {
          const [ip, port, protocol, pass, notpass, firsttime, updatetime] = parts;
          const key = `${ip},${port},${protocol}`;
          db[key] = { 
            ip, 
            port, 
            protocol, 
            pass: parseInt(pass) || 0, 
            notpass: parseInt(notpass) || 0,
            firsttime,
            updatetime
          };
        }
      }
    } catch (e) { $.error(`[CSV] Load error: ${e.message}`); }
    return db;
  }

  function saveCsvDb(filePath, db) {
    try {
      const header = 'ip,port,protocol,pass,notpass,success_rate,firsttime,updatetime';
      const currentTime = getTime();
      let existingData = {};

      // 读取现有数据（如果文件存在）
      if (fs.existsSync(filePath)) {
        const existingContent = fs.readFileSync(filePath, 'utf8');
        const lines = existingContent.split(/\r?\n/).slice(1); // 跳过头部
        lines.forEach(line => {
          if (line.trim()) {
            const [ip, port, protocol, pass, notpass, , firsttime, updatetime] = line.split(',');
            const key = `${ip},${port},${protocol}`;
            existingData[key] = {
              ip,
              port,
              protocol,
              pass: parseInt(pass, 10),
              notpass: parseInt(notpass, 10),
              firsttime,
              updatetime
            };
          }
        });
      }

      // 合并现有数据和新数据
      Object.entries(db).forEach(([key, newData]) => {
        if (existingData[key]) {
          // 如果记录已存在，合并 pass/notpass 并保留最早 firsttime
          existingData[key] = {
            ...existingData[key],
            pass: existingData[key].pass + newData.pass,
            notpass: existingData[key].notpass + newData.notpass,
            updatetime: currentTime
          };
        } else {
          // 新记录，直接添加
          existingData[key] = {
            ...newData,
            firsttime: newData.firsttime || currentTime,
            updatetime: currentTime
          };
        }
      });

      // 按成功率排序
      const rows = Object.values(existingData)
        .map(item => {
          const total = item.pass + item.notpass;
          const rate = total === 0 ? 0.0 : (item.pass / total) * 100;
          return { ...item, rate };
        })
        .sort((a, b) => b.rate - a.rate);

      const lines = rows.map(r =>
        `${r.ip},${r.port},${r.protocol},${r.pass},${r.notpass},${r.rate.toFixed(1)},${r.firsttime},${r.updatetime}`
      );

      fs.writeFileSync(filePath, '\uFEFF' + [header, ...lines].join('\n'), 'utf8');
      $.info(`[CSV] Statistics saved to ${filePath}`);
    } catch (e) {
      $.error(`[CSV] Save error: ${e.message}`);
    }
  }

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

  $.info(`[${getTime()}] [Speedtest] 开始检测. 节点总数: ${proxies.length} (去重后: ${totalTasks}), 并发数: ${concurrency}, 超时设置: ${timeout}ms`);

  async function check(target) {
    processedCount++;
    try {
      // 平台适配：Windows 用 ms，macOS/Linux 用秒
      const isWin = eval('process.platform === "win32"');
      const timeoutValue = isWin ? timeout : timeout / 1000;

      const res = await ping.promise.probe(target, {
        timeout: timeoutValue,
      });
      const latency = res.alive ? Math.round(parseFloat(res.time)) : 0;

      if (latency > 0) {
        successCount++;
        if (latency < minLatency) minLatency = latency;
        if (latency > maxLatency) maxLatency = latency;
        $.info(`[${getTime()}] [${processedCount}/${totalTasks}] [${target}]: ${latency}ms`);
        serverResults.add(target);
      } 
      else {
        timeoutCount++;
        $.info(`[${getTime()}] [${processedCount}/${totalTasks}] [${target}]: Timeout`);
      }
    } catch (e) {
      timeoutCount++;
      $.error(`[${getTime()}] [${processedCount}/${totalTasks}] [${target}] 检测发生错误: ${e.message || e}`);
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

  $.info(`[${getTime()}] [Speedtest] 总结 --------------------------------------`);
  $.info(`[${getTime()}] [Speedtest] 总检测节点: ${totalTasks}`);
  $.info(`[${getTime()}] [Speedtest] 成功: ${successCount}, 超时/失败: ${timeoutCount}`);
  $.info(`[${getTime()}] [Speedtest] 最小延时: ${displayMin}ms, 最大延时: ${maxLatency}ms`);
  $.info(`[${getTime()}] [Speedtest] 通过率: ${passRate}%`);
  $.info(`[${getTime()}] [Speedtest] -------------------------------------------`);

  const db = loadCsvDb(csvDbPath);
  let dbUpdated = false;

  proxies.forEach(proxy => {
    const isPass = serverResults.has(proxy.server);
    if (isPass) {
      validProxies.push(proxy);
    }

    // 更新 CSV 统计
    if (proxy.server && proxy.port) {
      const protocol = proxy.type || 'unknown';
      const key = `${proxy.server},${proxy.port},${protocol}`;
      if (!db[key]) {
        db[key] = { 
          ip: proxy.server, 
          port: proxy.port, 
          protocol: protocol, 
          pass: 0, 
          notpass: 0,
          firsttime: null,
          updatetime: null
        };
      }
      isPass ? db[key].pass++ : db[key].notpass++;
      dbUpdated = true;
    }
  });

  if (dbUpdated) saveCsvDb(csvDbPath, db);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  $.info(`[${getTime()}] [Speedtest] 检测完毕. Pass: ${validProxies.length} Fail:${proxies.length}, 总耗时: ${totalTime}s`);

  $.info(`[${getTime()}] [Speedtest] End --------------------------------------`);
 
  return proxies;
}