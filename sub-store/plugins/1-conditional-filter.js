/**
 * Sub-Store 脚本：自定义条件过滤器
 * 功能：
 * 1. 支持根据 server/name/type 字段进行正则/包含/等于匹配
 * 2. 支持链式组合条件（AND/OR 逻辑）
 * 3. 可配置过滤动作（保留匹配项 或 排除匹配项）
 * 
 * matchType 类型说明（共 4 种）：
 * 1. regex - 正则表达式匹配（支持复杂模式匹配）
 * 2. contains - 包含匹配（子字符串匹配，不区分大小写）
 * 3. equals - 等于匹配（完全匹配，不区分大小写）
 * 4. ipv6 - IPv6 地址检测（使用 network.checkServerType() 方法，优先推荐）
 * 
 * 完整配置示例：
 * {
 *   "rules": [
 *     // ipv6 类型示例（推荐）
 *     { "field": "server", "matchType": "ipv6", "action": "exclude" },
 *     
 *     // regex 类型示例
 *     { "field": "server", "pattern": "^jp\\..*", "matchType": "regex", "action": "exclude" },
 *     { "field": "name", "pattern": "^[0-9]+", "matchType": "regex", "action": "exclude" },
 *     
 *     // contains 类型示例
 *     { "field": "name", "pattern": "测试", "matchType": "contains", "action": "exclude" },
 *     { "field": "name", "pattern": "香港", "matchType": "contains", "action": "include" },
 *     { "field": "server", "pattern": "google", "matchType": "contains", "action": "exclude" },
 *     
 *     // equals 类型示例
 *     { "field": "type", "pattern": "ss", "matchType": "equals", "action": "include" },
 *     { "field": "type", "pattern": "vmess", "matchType": "equals", "action": "exclude" },
 *     { "field": "type", "pattern": "trojan", "matchType": "equals", "action": "include" }
 *   ],
 *   "logic": "AND"  // 或 "OR" - AND 表示所有规则都满足，OR 表示任一规则满足
 * }
 * 
 * field 可选值：server, name, type
 * action 可选值：include (保留), exclude (排除)
 * logic 可选值：AND, OR
 */

// 全局常量配置 - 过滤规则
const FILTER_RULES = [
  { "field": "server", "matchType": "ipv6", "action": "exclude" },
  // { "field": "server", "pattern": "ipv6", "matchType": "contains", "action": "exclude" },
  { "field": "server", "pattern": "jp.sanmaojichang.com", "matchType": "equals", "action": "exclude" },
  { "field": "name", "pattern": "NL_speednode", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "Telegram:@config", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "HK", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "香港", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "台湾", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "TW", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "印度", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "ID", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "GB", "matchType": "contains", "action": "exclude" },
  { "field": "name", "pattern": "DE", "matchType": "contains", "action": "exclude" },
];

// 全局常量配置 - 逻辑关系 (AND 或 OR)
const FILTER_LOGIC = 'AND';

async function operator(proxies = [], targetPlatform, context) {
  const { log, utils, performance, network } = $substore.julong;

  performance.startTimer('custom-filter');

  log.info('Custom-Filter', `检测开始...`);
  log.info('Custom-Filter', `节点总数：${proxies.length}`);

  // 获取配置 - 支持通过 $arguments.jdebug 注入测试规则 (兼容 debug-runner 限制)
  let rules = FILTER_RULES;
  let logic = FILTER_LOGIC;

  // 检测是否存在 $arguments.jdebug 对象（测试环境注入）
  // 修改：从 $arguments 获取而不是 context.args，因为 debug-runner 不允许修改
  if (typeof $arguments !== 'undefined' && $arguments && $arguments.jdebug) {
    if ($arguments.jdebug['filter-rule']) {
      rules = $arguments.jdebug['filter-rule'];
      log.info('Custom-Filter', `使用注入的过滤规则 (来自 $arguments.jdebug.filter-rule)`);
    }
    if ($arguments.jdebug['filter-logic']) {
      logic = $arguments.jdebug['filter-logic'];
      log.info('Custom-Filter', `使用注入的过滤逻辑 (来自 $arguments.jdebug.filter-logic): ${logic}`);
    }
  } else {
    log.info('Custom-Filter', `使用默认过滤规则 (正常环境)`);
  }

  log.info('Custom-Filter', `过滤规则数：${rules.length}, 逻辑：${logic}`);

  // 匹配函数
  function matchValue(value, pattern, matchType) {
    if (!value) return false;
    const strValue = String(value);

    switch (matchType) {
      case 'ipv6':
        // 使用 network.checkServerType() 方法检测 IPv6（推荐方式）
        try {
          const type = network.checkServerType(strValue);
          if (type === 'ipv6') {
            return true;
          }
          // 如果 network.checkServerType() 未识别为 ipv6，使用正则表达式作为后备方案
          // 检测标准 IPv6 格式（如 2001:db8::1）
          const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
          return ipv6Regex.test(strValue);
        } catch (e) {
          log.error('Custom-Filter', `IPv6 检测失败：${strValue}, 错误：${e.message}`);
          // 出错时使用正则表达式作为后备方案
          const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
          return ipv6Regex.test(strValue);
        }
      case 'regex':
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(strValue);
        } catch (e) {
          log.error('Custom-Filter', `正则表达式无效：${pattern}`);
          return false;
        }
      case 'contains':
        return strValue.toLowerCase().includes(pattern.toLowerCase());
      case 'equals':
        return strValue.toLowerCase() === pattern.toLowerCase();
      default:
        return strValue.toLowerCase().includes(pattern.toLowerCase());
    }
  }

  // 检查单个规则是否匹配
  function checkRule(proxy, rule) {
    const { field, pattern, matchType, action } = rule;
    let value;

    switch (field) {
      case 'server':
        value = proxy.server;
        break;
      case 'name':
        value = proxy.name;
        break;
      case 'type':
        value = proxy.type;
        break;
      default:
        log.warn('Custom-Filter', `未知字段：${field}`);
        return false;
    }

    return matchValue(value, pattern, matchType || 'contains');
  }

  // 检查代理是否应被保留
  function shouldKeep(proxy) {
    if (rules.length === 0) {
      return { keep: true, matchedRules: [] }; // 无规则时保留所有
    }

    const ruleResults = rules.map((rule, index) => {
      const matched = checkRule(proxy, rule);
      const action = rule.action || 'exclude';
      // action=exclude: 匹配到则排除（返回 false）
      // action=include: 匹配到则保留（返回 true）
      const keepResult = action === 'exclude' ? !matched : matched;

      return {
        ruleIndex: index,
        rule: rule,
        matched: matched,
        action: action,
        keepResult: keepResult
      };
    });

    let keep;
    if (logic === 'OR') {
      keep = ruleResults.some((r) => r.keepResult);
    } else {
      keep = ruleResults.every((r) => r.keepResult);
    }

    // 收集实际匹配到的规则（matched = true 的规则）
    const matchedRules = ruleResults.filter((r) => r.matched).map((r) => ({
      ruleIndex: r.ruleIndex,
      field: r.rule.field,
      pattern: r.rule.pattern,
      matchType: r.rule.matchType,
      action: r.rule.action
    }));

    return { keep, matchedRules };
  }

  // 过滤逻辑
  const filteredProxies = proxies.filter((proxy) => {
    const result = shouldKeep(proxy);
    if (!result.keep) {
      log.info('Custom-Filter', `已过滤节点：${proxy.name} (${proxy.server || 'N/A'}), 匹配规则：${JSON.stringify(result.matchedRules)}`);
    }
    return result.keep;
  });

  // 获取耗时信息
  const elapsedMs = performance.endTimer('custom-filter');
  const totalTime = performance.formatDuration(elapsedMs);

  log.info('Custom-Filter', `检测完毕。剩余节点：${filteredProxies.length}, 过滤：${proxies.length - filteredProxies.length}, 总耗时：${totalTime}`);
  log.info('Custom-Filter', `End`);

  return filteredProxies;
}