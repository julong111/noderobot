/**
 * Sub-Store 脚本: 根据 CSV 统计数据的成功率过滤节点
 * 
 * 逻辑：读取 speedtest.js 生成的 CSV 文件，根据 success_rate 过滤节点。
 * 默认过滤掉 success_rate < 60% 的节点。
 * 
 * 参数:
 * - csv_path: CSV 文件路径 (默认: /Users/julong/Projects/noderobot/s/node-connective.csv)
 * - rate: 最小成功率 (0-100), 低于此值的节点将被移除 (默认: 60)
 */

function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const fs = eval('require("fs")');
  
  // 参数处理
  const csvDbPath = $arguments.csv_path || '/Users/julong/Projects/noderobot/s/node-connective.csv';
  const minRate = parseFloat($arguments.rate || 60);

  // 复用高性能时间函数
  const getTime = (() => {
    let lastSecond = 0;
    let cachedPrefix = '';
    return () => {
      const now = Date.now();
      const ms = now % 1000;
      const second = (now / 1000) | 0;
      if (second !== lastSecond) {
        lastSecond = second;
        const d = new Date(now);
        const m = d.getMonth() + 1;
        const date = d.getDate();
        const h = d.getHours();
        const min = d.getMinutes();
        const s = d.getSeconds();
        cachedPrefix = `${d.getFullYear()}-${m < 10 ? '0' + m : m}-${date < 10 ? '0' + date : date} ` +
                       `${h < 10 ? '0' + h : h}:${min < 10 ? '0' + min : min}:${s < 10 ? '0' + s : s}`;
      }
      if (ms < 10) return cachedPrefix + '.00' + ms;
      if (ms < 100) return cachedPrefix + '.0' + ms;
      return cachedPrefix + '.' + ms;
    };
  })();

  $.info(`[${getTime()}] [FilterPingRate] Start --------------------------------------`);
  $.info(`[${getTime()}] [FilterPingRate] CSV Path: ${csvDbPath}`);
  $.info(`[${getTime()}] [FilterPingRate] Min Rate: ${minRate}%`);

  // 加载 CSV
  const db = {};
  if (fs.existsSync(csvDbPath)) {
    try {
      let content = fs.readFileSync(csvDbPath, 'utf8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // Strip BOM
      const lines = content.split(/\r?\n/);
      // Skip header (i=1)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const parts = line.split(',');
        // ip,port,protocol,pass,notpass,success_rate
        if (parts.length >= 5) {
          const [ip, port, protocol, passStr, notpassStr] = parts;
          const pass = parseInt(passStr) || 0;
          const notpass = parseInt(notpassStr) || 0;
          const total = pass + notpass;
          // 重新计算 rate 以确保准确性
          const rate = total === 0 ? 0 : (pass / total) * 100;
          
          const key = `${ip},${port},${protocol}`;
          db[key] = { pass, notpass, rate };
        }
      }
      $.info(`[${getTime()}] [FilterPingRate] Loaded ${Object.keys(db).length} records from CSV.`);
    } catch (e) {
      $.error(`[${getTime()}] [FilterPingRate] Error loading CSV: ${e.message}`);
    }
  } else {
    $.warn(`[${getTime()}] [FilterPingRate] CSV file not found at ${csvDbPath}`);
  }

  const filteredProxies = proxies.filter(proxy => {
    // 兼容性检查
    if (!proxy.server || !proxy.port) return true;

    const protocol = proxy.type || 'unknown';
    const key = `${proxy.server},${proxy.port},${protocol}`;
    
    const stats = db[key];
    
    if (stats) {
      // 如果有统计数据，且成功率低于阈值，则过滤
      if (stats.rate < minRate) {
        $.info(`[${getTime()}] [FilterPingRate] Removing ${proxy.name} (${key}): Rate ${stats.rate.toFixed(1)}% < ${minRate}% (Pass: ${stats.pass}, Fail: ${stats.notpass})`);
        return false;
      }
    }
    // 如果没有记录，默认保留
    return true;
  });

  $.info(`[${getTime()}] [FilterPingRate] Filtered: ${proxies.length} -> ${filteredProxies.length} (Removed ${proxies.length - filteredProxies.length})`);
  $.info(`[${getTime()}] [FilterPingRate] End --------------------------------------`);

  return filteredProxies;
}