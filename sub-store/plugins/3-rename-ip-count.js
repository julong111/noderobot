/**
 * Sub-Store 脚本: 统计节点服务器 (IP/域名) 出现次数，并以此重命名节点。
 * 
 * 功能:
 * 1. 统计每个服务器地址 (IP或域名) 在节点列表中出现的次数。
 * 2. 将统计结果（服务器, 次数, 首次时间, 更新时间）保存到 CSV 文件中。
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
  const currentTime = getTime();
  proxies.forEach(proxy => {
    if (proxy.server) {
      if (!serverCounts[proxy.server]) {
        // 首次出现，记录首次时间和更新时间
        serverCounts[proxy.server] = {
          count: 1,
          firsttime: currentTime,
          updatetime: currentTime
        };
      } else {
        // 已存在，只更新计数和更新时间
        serverCounts[proxy.server].count += 1;
        serverCounts[proxy.server].updatetime = currentTime;
      }
    }
  });
  $.info(`[${getTime()}] [${scriptName}] Found ${Object.keys(serverCounts).length} unique servers (IPs/domains).`);

  // 3. 保存统计到 CSV
  if (Object.keys(serverCounts).length > 0) {
    try {
      const header = 'server,count,firsttime,updatetime';
      let existingData = {};

      // 读取现有的 CSV 文件（如果存在）
      if (fs.existsSync(csvDbPath)) {
        const existingContent = fs.readFileSync(csvDbPath, 'utf8');
        const lines = existingContent.split('\n').slice(1); // 跳过头部
        lines.forEach(line => {
          if (line.trim()) {
            const [server, count, firsttime, updatetime] = line.split(',');
            existingData[server] = {
              count: parseInt(count, 10),
              firsttime: firsttime,
              updatetime: updatetime
            };
          }
        });
      }

      // 合并现有数据和新数据
      Object.entries(serverCounts).forEach(([server, newData]) => {
        if (existingData[server]) {
          // 如果服务器已存在，合并数据：保持最早的 firsttime，更新最新的 updatetime 和 count
          existingData[server] = {
            count: existingData[server].count + newData.count,
            firsttime: existingData[server].firsttime,
            updatetime: newData.updatetime
          };
        } else {
          // 新服务器，直接添加
          existingData[server] = newData;
        }
      });

      // 按次数降序排序
      const sortedData = Object.entries(existingData)
        .sort((a, b) => b[1].count - a[1].count);

      const lines = sortedData.map(([server, data]) =>
        `${server},${data.count},${data.firsttime},${data.updatetime}`);

      fs.writeFileSync(csvDbPath, '\uFEFF' + [header, ...lines].join('\n'), 'utf8');
      $.info(`[${getTime()}] [${scriptName}] Server count statistics saved to ${csvDbPath}`);
    } catch (e) {
      $.error(`[${getTime()}] [${scriptName}] Error saving server count CSV: ${e.message}`);
    }
  }

  // 4. 重命名节点
  proxies.forEach(proxy => {
    const serverData = serverCounts[proxy.server];
    if (serverData) {
      proxy.name = `${serverData.count}C|${proxy.name}`;
    }
  });

  $.info(`[${getTime()}] [${scriptName}] Rename complete. Total proxies: ${proxies.length}`);
  $.info(`[${getTime()}] [${scriptName}] End --------------------------------------`);
  return proxies;
}