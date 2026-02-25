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

async function operator(proxies = [], targetPlatform, context) {
  const { log, csv } = $substore.julong;
  
  // 参数处理
  const csvDbPath = $arguments.csv_path || './node-connective.csv';
  const nameFormat = $arguments.name_format || '{rate}|{name}';
  const scriptName = 'RenameByPassRate';

  log.info(scriptName, 'Start --------------------------------------');
  log.info(scriptName, `CSV Path: ${csvDbPath}`);

  // 加载 CSV
  const db = {};
  try {
    // 使用公共 CSV 工具读取
    const rows = await csv.read(csvDbPath);
    
    if (rows.length > 0) {
      rows.forEach(row => {
        // 确保关键字段存在 (ip, port)
        // csv.read 返回的对象 key 对应 header (ip, port, protocol, pass, notpass)
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
      log.info(scriptName, `CSV file is empty or not found.`);
    }
  } catch (e) {
    log.error(scriptName, `Error loading CSV: ${e.message}`);
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
        .replace('{rate}', rate+"%")
        .replace('{name}', originalName);
      renamedCount++;
      log.info(scriptName, `Renamed: [${originalName}] -> [${proxy.name}]`);
    }
  });

  log.info(scriptName, `Rename complete. Renamed ${renamedCount} of ${proxies.length} proxies.`);
  log.info(scriptName, `End --------------------------------------`);

  return proxies;
}