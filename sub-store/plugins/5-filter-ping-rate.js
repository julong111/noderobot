async function operator(proxies = [], targetPlatform, context) {
  const { log } = $substore.julong;
  const scriptName = 'FilterPingRate';

  const targetRate = parseInt($arguments.rate);
  const targetCount = parseInt($arguments.count);

  if (isNaN(targetRate) || isNaN(targetCount)) {
    throw new Error('FilterPingRate: arguments `rate` and `count` are required.');
  }

  log.info(scriptName, 'Start --------------------------------------');
  log.info(scriptName, `Condition: Rate < ${targetRate}% AND Count >= ${targetCount}`);

  const filteredProxies = proxies.filter(proxy => {
    const match = proxy.name?.match(/(\d+)%\|(\d+)C\|/);
    if (match) {
      const rate = parseInt(match[1]);
      const count = parseInt(match[2]);
      if (rate < targetRate && count >= targetCount) {
        log.info(scriptName, `Removing ${proxy.name}: Rate ${rate}% < ${targetRate}% and Count ${count} >= ${targetCount}`);
        return false;
      }
    }
    // 如果没有记录，默认保留
    return true;
  });

  log.info(scriptName, `Filtered: ${proxies.length} -> ${filteredProxies.length} (Removed ${proxies.length - filteredProxies.length})`);
  log.info(scriptName, `End --------------------------------------`);

  return filteredProxies;
}