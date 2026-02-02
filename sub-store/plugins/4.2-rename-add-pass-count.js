/**
 * Sub-Store 脚本: 根据 CSV 统计数据的成功率重命名节点
 * 
 * 逻辑：读取 speedtest.js 生成的 CSV 文件，提取节点的成功率，并将其添加到节点名称前缀。
 * 
 * 格式: "成功率|原始名称"
 * 
 * 参数:
 * - csv_path: CSV 文件路径 (默认: /Users/julong/Projects/noderobot/s/node-connective.csv)
 * - name_format: 重命名格式 (默认: "{rate}|{name}")
 */

function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const fs = eval('require("fs")');
  
  // 参数处理
  const csvDbPath = $arguments.csv_path || './node-connective.csv';
  const nameFormat = $arguments.name_format || '{rate}|{name}';

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

  const scriptName = 'RenameByPassRate';
  $.info(`[${getTime()}] [${scriptName}] Start --------------------------------------`);
  $.info(`[${getTime()}] [${scriptName}] CSV Path: ${csvDbPath}`);

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
      $.info(`[${getTime()}] [${scriptName}] Loaded ${Object.keys(db).length} records from CSV.`);
    } catch (e) {
      $.error(`[${getTime()}] [${scriptName}] Error loading CSV: ${e.message}`);
    }
  } else {
    $.warn(`[${getTime()}] [${scriptName}] CSV file not found at ${csvDbPath}`);
  }

  // 重命名节点
  let renamedCount = 0;
  proxies.forEach(proxy => {
    // 兼容性检查
    if (!proxy.server || !proxy.port) return;

    const protocol = proxy.type || 'unknown';
    const key = `${proxy.server},${proxy.port},${protocol}`;
    
    const stats = db[key];
    if (stats) {
      const rate = stats.rate.toFixed(0);
      const originalName = proxy.name;
      proxy.name = nameFormat
        .replace('{rate}', rate)
        .replace('{name}', originalName);
      renamedCount++;
      $.info(`[${getTime()}] [${scriptName}] Renamed: [${originalName}] -> [${proxy.name}]`);
    }
  });

  $.info(`[${getTime()}] [${scriptName}] Rename complete. Renamed ${renamedCount} of ${proxies.length} proxies.`);
  $.info(`[${getTime()}] [${scriptName}] End --------------------------------------`);

  return proxies;
}