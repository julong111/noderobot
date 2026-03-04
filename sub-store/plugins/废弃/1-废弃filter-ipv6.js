/**
 * Sub-Store 脚本: 过滤掉 IPv6 节点
 * * 功能：
 * 1. 检测节点的 server 地址
 * 2. 识别并移除所有 IPv6 类型的节点（包括原生格式和 [xxxx::xxxx] 格式）
 * 3. 仅保留 IPv4 或 域名地址的节点
 */

async function operator(proxies = [], targetPlatform, context) {
  const { log, utils, performance, network } = $substore.julong;

  performance.startTimer('filter-ipv6');

  log.info('Filter-IPv6', `检测开始...`);

  log.info('Filter-IPv6', `节点总数：${proxies.length}`);

  // 过滤逻辑
  const filteredProxies = proxies.filter((proxy) => {
    const server = proxy.server;
    if (!server) {
      log.error('Filter-IPv6', `未检测到 server 字段: ${proxy.name}`);
      return true;
    }

    const type = network.checkServerType(server)
    if (type === 'ipv6') {
      log.info('Filter-IPv6', `已过滤 IPv6 节点: ${proxy.name} (${server})`);
      return false; // 排除
    }
    return true; // 保留 IPv4 或 域名
  });

  // 获取耗时信息
  const elapsedMs = performance.endTimer('filter-ipv6');
  const totalTime = performance.formatDuration(elapsedMs);

  log.info('Filter-IPv6', `检测完毕. 剩余节点: ${filteredProxies.length}, 总耗时: ${totalTime}`);
  log.info('Filter-IPv6', `End`);

  return filteredProxies;
}