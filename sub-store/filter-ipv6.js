/**
 * Sub-Store 脚本: 过滤掉 IPv6 节点
 * * 功能：
 * 1. 检测节点的 server 地址
 * 2. 识别并移除所有 IPv6 类型的节点（包括原生格式和 [xxxx::xxxx] 格式）
 * 3. 仅保留 IPv4 或 域名地址的节点
 */

async function operator(proxies = [], targetPlatform, context) {
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

  $.info(`[${getTime()}] [Filter-IPv6] Start --------------------------------------`);
  const { isIPv6 } = ProxyUtils; // 使用 Sub-Store 内置的 ProxyUtils 工具类


  $.info(`[${getTime()}] [Filter-IPv6] 原始节点总数: ${proxies.length}`);

  // 过滤逻辑
  const filteredProxies = proxies.filter((proxy) => {
    const server = proxy.server;

    // 1. 基础校验：如果没有 server 字段，默认保留或根据需求处理
    if (!server) return true;

    // 2. 识别 IPv6
    // 情况 A: Sub-Store 内置正则判断
    // 情况 B: 手动处理常见的带方括号的 IPv6 地址 (例如 [2001:db8::1])
    const isV6 = isIPv6(server) || (server.includes(':') && server.includes('[') && server.includes(']'));

    if (isV6) {
      $.info(`[${getTime()}] [Filter-IPv6] 已过滤 IPv6 节点: ${proxy.name} (${server})`);
      return false; // 排除
    }

    return true; // 保留 IPv4 或 域名
  });

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  $.info(`[${getTime()}] [Filter-IPv6] 检测完毕. 剩余节点: ${filteredProxies.length}, 总耗时: ${totalTime}s`);
  $.info(`[${getTime()}] [Filter-IPv6] End --------------------------------------`);
  return filteredProxies;
}