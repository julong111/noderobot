async function operator(proxies = [], targetPlatform, context) {

  const { log, performance, csv } = $substore.julong;

  performance.startTimer('RenameByServerCount');

  log.info('RenameByServerCount', `开始... 节点数：${proxies.length}`);

  const args = $arguments || {};

  // 1. 参数处理
  const csvPath = args.csv_path;
  const csvColumns = ['server', 'count', 'firsttime', 'updatetime'];
  log.info('RenameByServerCount', `CSV Path: ${csvPath}`);

  // Add validation for CSV path
  if (!csvPath) {
    throw new Error('CSV path is required. Please provide a valid CSV file path.');
  }

  // 2. 统计服务器 (IP/域名) 出现次数
  const serverCounts = {};
  const currentTime = performance.getTime();
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
  log.info('RenameByServerCount', `Found ${Object.keys(serverCounts).length} unique servers (IPs/domains).`);

  // 3. 保存统计到 CSV - 使用 Julong 工具库的通用函数
  if (Object.keys(serverCounts).length > 0) {
    try {
      // 确保 $ 变量已定义
      const $ = $substore;

      let allData = [];
      for (const [server, newData] of Object.entries(serverCounts)) {
        const item = {
          server: server,
          ...newData
        };

        await csv.operate(
          csvPath,
          item,
          (existing, current) => {
            if (existing) {
              // 如果服务器已存在，合并数据：保持最早的 firsttime，更新最新的 updatetime 和 count
              return {
                ...current,
                count: (parseInt(existing.count) || 0) + current.count,
                firsttime: existing.firsttime,
              };
            } else {
              // 新服务器，直接使用传入的数据
              return item;
            }
          },
          csvColumns,
          ['server'], // keys
          ['count', 'updatetime'], // updates
          allData
        );
      }

      csv.save(csvPath, csvColumns, allData);
      log.info('RenameByServerCount', `Server count statistics saved to ${csvPath}`);

    } catch (e) {
      log.error('RenameByServerCount', `Error saving server count CSV: ${e.message}`);
    }
  }

  // 4. 重命名节点
  proxies.forEach(proxy => {
    const serverData = serverCounts[proxy.server];
    if (serverData) {
      proxy.name = `${serverData.count}C|${proxy.name}`;
    }
  });

  // 获取耗时信息
  const elapsedMs = performance.endTimer('RenameByServerCount');
  const totalTime = performance.formatDuration(elapsedMs);

  log.info('RenameByServerCount', `完毕. 剩余节点: ${proxies.length}, 总耗时: ${totalTime}`);
  log.info('RenameByServerCount', `End`);

  return proxies;
}