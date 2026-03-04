/**
 * Sub-Store 脚本: 根据 IP 归属地重命名 (适配内置 MMDB 工具)
 */

async function operator(proxies = [], targetPlatform, context) {
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

  $.info(`[${getTime()}] [RenameByIP] Start --------------------------------------`);

  const { isIP, removeFlag } = ProxyUtils;
  const args = $arguments || {};
  
  // 从 ProxyUtil-Geo-MMDB 导入工具函数
  // 注意：在 Sub-Store 脚本环境中，如果 ProxyUtil 已经全局加载，可以直接引用
  const { MMDB, getFlag: getFlagByISO } = ProxyUtils; 

  // 1. 初始化 MMDB 实例
  // 路径参数通过 Sub-Store 的环境变量或 args 传递
  const COUNTRY_PATH = args.path || "/Users/julong/Projects/noderobot/config/country.mmdb";
  
  let mmdb;
  try {
    mmdb = new MMDB({ country: COUNTRY_PATH });
    $.info(`[${getTime()}] [RenameByIP] MMDB Loaded from ${COUNTRY_PATH}`);
  } catch (e) {
    $.error(`[${getTime()}] [RenameByIP] MMDB Initialize Error: ${e.message || e}`);
    return proxies;
  }

  // 2. 配置格式
  // 注意：内置 MMDB 类通常不提供城市名(City)，仅提供 ISO 国家代码
  const nameformat = args.nameformat || "{flag} {iso} {index}";
  const isoCounts = {};

  // 3. 处理节点
  const tasks = proxies.map(async (proxy) => {
    if (!proxy.server || !isIP(proxy.server)) return;

    try {
      // 使用内置 MMDB 类的 geoip 方法获取 ISO Code (例如: "CN", "US")
      const iso = mmdb.geoip(proxy.server);
      if (iso) {
        // 使用内置的 getFlag 工具根据 ISO 获取国旗
        const flag = getFlagByISO(iso) || "🏳️";
        
        // 更新计数
        if (!isoCounts[iso]) isoCounts[iso] = 0;
        isoCounts[iso]++;
        const index = isoCounts[iso].toString().padStart(2, '0');
        // 格式化名称
        let newName = nameformat
          .replace(/{flag}/g, flag)
          .replace(/{iso}/g, iso)
          .replace(/{index}/g, index)
          ;
        let newNameVal = newName.replace(/\s+/g, ' ').trim();
        $.info(`[${getTime()}] [${proxy.name}] ---> [${newNameVal}]`);
        proxy.name = newNameVal;
      }
    } catch (err) {
      $.error(`[${getTime()}] [RenameByIP] Rename Error: ${err.message || err}`);
    }
  });

  await Promise.all(tasks);

  $.info(`[${getTime()}] [RenameByIP] 执行完毕. 节点总数: ${proxies.length}`);
  $.info(`[${getTime()}] [RenameByIP] End --------------------------------------`);
  return proxies;
}