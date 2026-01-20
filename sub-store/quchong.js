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
  const $ = $substore;

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

  $.info(`[${getTime()}] [RemoveDuplicates] Start --------------------------------------`);
  // 用于存储去重后的节点列表
  const uniqueProxies = [];
  // 用于记录已经出现过的 server:port:type 组合
  const seen = new Set();

  proxies.forEach((proxy) => {
    // 兼容性处理：检查节点是否有 server 和 port 字段
    // 有些特殊类型的节点（如 external-proxy 或其他非标准节点）可能没有这些字段
    // 对于这些节点，我们选择直接保留，不参与去重逻辑
    if (!proxy.server || !proxy.port) {
      uniqueProxies.push(proxy);
      return;
    }

    // 构造唯一标识键
    // 将 server 转换为小写，以忽略域名大小写的差异 (例如 example.com 和 EXAMPLE.COM 应视为同一个)
    // port 是数字，直接拼接
    // 增加类型检查，防止 server 不是字符串导致报错
    const server = typeof proxy.server === 'string' ? proxy.server.toLowerCase() : String(proxy.server);
    const type = proxy.type || '';
    const key = `${server}:${proxy.port}:${type}`;

    // 如果这个键还没有出现过，则保留该节点，并记录键
    if (!seen.has(key)) {
      seen.add(key);
      uniqueProxies.push(proxy);
    } else {
      $.info(`[${getTime()}] [RemoveDuplicates] Remove Key: ${key}, ${JSON.stringify(proxy)} `);
    }
    // 如果键已经出现过，说明是重复节点，直接忽略（即删除）
  });

  $.info(`[${getTime()}] [RemoveDuplicates] 执行完毕. Pass: ${uniqueProxies.length} Total: ${proxies.length}`);
  $.info(`[${getTime()}] [RemoveDuplicates] End --------------------------------------`);
  return uniqueProxies;
}