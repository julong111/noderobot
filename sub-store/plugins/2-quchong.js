/**
 * Sub-Store 节点去重脚本
 * 
 * 功能：遍历节点列表，根据节点的 server (IP/域名), port 和 type 进行去重。
 * 逻辑：保留第一个出现的 server:port:type 组合，后续重复的节点将被移除。
 * 
 * 用法：
 * 1. 将此脚本保存为 quchong.js
 * 2. 在 Sub-Store 的 "节点操作 (Node Operations)" 中添加 "脚本操作 (Script Operator)"
 * 3. 脚本类型选择 "Path" 并指向此文件
 */

function operator(proxies = [], targetPlatform, context) {
  const { log, utils, performance, network } = $substore.julong;

  performance.startTimer('remove-duplicates');

  log.info('RemoveDuplicates', `开始... 节点数：${proxies.length}`);

  // Reverse the proxies array to process from last to first
  const reversedProxies = [...proxies].reverse();

  // 用于存储去重后的节点列表
  const uniqueProxies = [];
  // 用于记录已经出现过的 server:port:type 组合
  const seen = new Set();

  reversedProxies.forEach((proxy) => {
    // 兼容性处理：检查节点是否有 server 和 port 字段
    if (!proxy.server || !proxy.port) {
      uniqueProxies.push(proxy);
      return;
    }

    // 构造唯一标识键
    const server = typeof proxy.server === 'string' ? proxy.server.toLowerCase() : String(proxy.server);
    const type = proxy.type || '';
    const key = `${server}:${proxy.port}:${type}`;

    // 如果这个键还没有出现过，则保留该节点，并记录键
    if (!seen.has(key)) {
      seen.add(key);
      uniqueProxies.push(proxy);
    } else {
      // 如果键已经存在，移除旧节点并保留当前节点
      const indexToRemove = uniqueProxies.findIndex(
        (p) =>
          (typeof p.server === 'string' ? p.server.toLowerCase() : String(p.server)) === server &&
          p.port === proxy.port &&
          (p.type || '') === type
      );
      if (indexToRemove !== -1) {
        uniqueProxies.splice(indexToRemove, 1); // 移除旧节点
        uniqueProxies.push(proxy); // 保留新节点
      }
      log.info('RemoveDuplicates', `Replace Key: ${key}, ${JSON.stringify(proxy)}`);
    }
  });

  // 恢复原始顺序（因为是从后往前处理的）
  uniqueProxies.reverse();

  // 获取耗时信息
  const elapsedMs = performance.endTimer('remove-duplicates');
  const totalTime = performance.formatDuration(elapsedMs);

  log.info('RemoveDuplicates', `检测完毕. 剩余节点: ${uniqueProxies.length}, 总耗时: ${totalTime}`);
  log.info('RemoveDuplicates', `End`);

  return uniqueProxies;
}