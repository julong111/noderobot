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

async function operator(proxies = [], targetPlatform, context) {
  const { log, csv } = $substore.julong;
  const scriptName = 'FilterPingRate';

  // 参数处理
  const csvDbPath = $arguments.csv_path;
  if (!csvDbPath) {
    throw new Error('FilterPingRate: `csv_path` argument is required.');
  }
  const minRate = parseFloat($arguments.rate || 60);

  log.info(scriptName, 'Start --------------------------------------');
  log.info(scriptName, `CSV Path: ${csvDbPath}`);
  log.info(scriptName, `Min Rate: ${minRate}%`);

  // 加载 CSV
  const db = {};
  try {
    const rows = await csv.read(csvDbPath);
    if (rows.length > 0) {
      rows.forEach(row => {
        if (row.ip && row.port) {
          const pass = parseInt(row.pass) || 0;
          const notpass = parseInt(row.notpass) || 0;
          const total = pass + notpass;
          // 重新计算 rate 以确保准确性
          const rate = total === 0 ? 0 : (pass / total) * 100;

          const protocol = row.protocol || 'unknown';
          const key = `${row.ip},${row.port},${protocol}`;
          db[key] = { pass, notpass, rate };
        }
      });
      log.info(scriptName, `Loaded ${Object.keys(db).length} records from CSV.`);
    } else {
      log.info(scriptName, `CSV file is empty or not found at ${csvDbPath}`);
    }
  } catch (e) {
    log.error(scriptName, `Error loading CSV: ${e.message}`);
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
        log.info(scriptName, `Removing ${proxy.name} (${key}): Rate ${stats.rate.toFixed(1)}% < ${minRate}% (Pass: ${stats.pass}, Fail: ${stats.notpass})`);
        return false;
      }
    }
    // 如果没有记录，默认保留
    return true;
  });

  log.info(scriptName, `Filtered: ${proxies.length} -> ${filteredProxies.length} (Removed ${proxies.length - filteredProxies.length})`);
  log.info(scriptName, `End --------------------------------------`);

  return filteredProxies;
}