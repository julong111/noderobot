/**
 * Sub-Store 脚本: 根据 CSV 测速及联通统计数据过滤连通性不佳的节点
 */

async function operator(proxies = [], targetPlatform, context) {
  const { log } = $substore.julong;
  const scriptName = 'FilterPingRate';

  const targetRate = parseInt($arguments.rate);
  const targetCount = parseInt($arguments.count);

  if (isNaN(targetRate) || isNaN(targetCount)) {
    throw new Error('FilterPingRate: arguments `rate` and `count` are required.');
  }

  log.info(scriptName, 'Start --------------------------------------');
  log.info(scriptName, `Condition: Count >= ${targetCount} & Rate < ${targetRate}%`);

  const filteredProxies = proxies.filter(proxy => {
    // 支持两种顺序：10C|10%| 或 10%|10C|
    const matchCountFirst = proxy.name?.match(/(\d+)C\|(\d+)%\|/);
    const matchRateFirst = proxy.name?.match(/(\d+)%\|(\d+)C\|/);

    let count, rate;
    if (matchCountFirst) {
      count = parseInt(matchCountFirst[1]);
      rate = parseInt(matchCountFirst[2]);
    } else if (matchRateFirst) {
      rate = parseInt(matchRateFirst[1]);
      count = parseInt(matchRateFirst[2]);
    }

    if (count !== undefined && rate !== undefined) {
      if (count >= targetCount && rate <= targetRate) {
        log.info(scriptName, `Removing ${proxy.name}: Count ${count} >= ${targetCount} && Rate ${rate}% <= ${targetRate}%`);
        return false;
      } else {
        log.info(scriptName, `Validate ${proxy.name}`);
      }
    } else {
      log.info(scriptName, `Pass ${proxy.name}`);
    }
    // 如果没有记录，默认保留
    return true;
  });

  log.info(scriptName, `Filtered: ${proxies.length} -> ${filteredProxies.length} (Removed ${proxies.length - filteredProxies.length})`);
  log.info(scriptName, `End --------------------------------------`);

  return filteredProxies;
}