/**
 * Sub-Store 脚本: 统计节点服务器 (IP/域名) 出现次数，并以此重命名节点。
 * 
 * 功能:
 * 1. 统计每个服务器地址 (IP或域名) 在节点列表中出现的次数。
 * 2. 将统计结果（服务器, 次数）保存到 CSV 文件中。
 * 3. 根据格式 "{count}|{original_name}" 重命名节点。
 * 
 * 参数:
 * - csv_path: 统计结果 CSV 文件的保存路径 (默认: ./node-server-count.csv)
 */

async function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const fs = eval('require("fs")');

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
        cachedPrefix = d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0') + ' ' +
          String(d.getHours()).padStart(2, '0') + ':' +
          String(d.getMinutes()).padStart(2, '0') + ':' +
          String(d.getSeconds()).padStart(2, '0');
      }
      if (ms < 10) return cachedPrefix + '.00' + ms;
      if (ms < 100) return cachedPrefix + '.0' + ms;
      return cachedPrefix + '.' + ms;
    };
  })();
  
  const scriptName = 'RenameByServerCount';
  $.info(`[${getTime()}] [${scriptName}] Start --------------------------------------`);
  
  const args = $arguments || {};
  
  // 1. 参数处理
  const csvDbPath = args.csv_path || './node-server-count.csv';
  $.info(`[${getTime()}] [${scriptName}] CSV Path: ${csvDbPath}`);

  // 2. 统计服务器 (IP/域名) 出现次数
  const serverCounts = {};
  proxies.forEach(proxy => {
    if (proxy.server) {
      serverCounts[proxy.server] = (serverCounts[proxy.server] || 0) + 1;
    }
  });
  $.info(`[${getTime()}] [${scriptName}] Found ${Object.keys(serverCounts).length} unique servers (IPs/domains).`);

  // 3. 保存统计到 CSV
  if (Object.keys(serverCounts).length > 0) {
    try {
      const header = 'server,count';
      const rows = Object.entries(serverCounts)
        .map(([server, count]) => ({ server, count }))
        .sort((a, b) => b.count - a.count); // 按次数降序排序
      
      const lines = rows.map(r => `${r.server},${r.count}`);
      fs.writeFileSync(csvDbPath, '\uFEFF' + [header, ...lines].join('\n'), 'utf8');
      $.info(`[${getTime()}] [${scriptName}] Server count statistics saved to ${csvDbPath}`);
    } catch (e) {
      $.error(`[${getTime()}] [${scriptName}] Error saving server count CSV: ${e.message}`);
    }
  }

  // 4. 重命名节点
  proxies.forEach(proxy => {
    const count = serverCounts[proxy.server];
    if (count) {
      proxy.name = `${count}C|${proxy.name}`;
    }
  });

  $.info(`[${getTime()}] [${scriptName}] Rename complete. Total proxies: ${proxies.length}`);
  $.info(`[${getTime()}] [${scriptName}] End --------------------------------------`);
  return proxies;
}