/**
 * Filter 插件测试 - 使用测试框架
 */

const { runScript } = require('./debug-runner');
const { TestSuite, assert } = require('./test-framework');
const pluginFile = '../plugins/1-conditional-filter.js'

const mockProxies = [
  { name: '节点 A-香港', server: 'hk.example.com', port: 443, type: 'vmess' },
  { name: '节点 B-日本', server: 'jp.sanmaojichang.com', port: 80, type: 'ss' },
  { name: '节点 C-美国', server: 'us.google.com', port: 443, type: 'trojan' },
  { name: '节点 D-测试', server: 'ipv6.example.com', port: 80, type: 'vmess' },
  { name: '节点 E-新加坡', server: 'sg.example.com', port: 443, type: 'ss' },
  { name: '123 节点 F', server: 'tw.example.com', port: 80, type: 'trojan' },
  { name: '节点 G-IPv6', server: 'ipv6.test.com', port: 443, type: 'vmess' },
  { name: '节点 H-IPv6 地址', server: '2001:db8::1', port: 80, type: 'ss' },
  { name: '节点 I-日本 2', server: 'jp.sanmaojichang.com', port: 443, type: 'trojan' },
  { name: '节点 J-日本 3', server: 'jp.sanmaojichang.com', port: 8080, type: 'vmess' }
];

const filterRules = {
  'filter-rule': [
    { field: 'server', matchType: 'ipv6', action: 'exclude' },
    { field: 'server', pattern: 'jp.sanmaojichang.com', matchType: 'equals', action: 'exclude' },
    { field: 'name', pattern: '测试', matchType: 'contains', action: 'exclude' }
  ],
  'filter-logic': 'AND'
};

const suite = new TestSuite('Filter Plugin Tests');

suite.test('排除 ipv6 节点', async () => {
  const result = await runScript(pluginFile, {
    args: { jdebug: filterRules },
    proxies: mockProxies,
    debug: false,
  });

  assert.notEmpty(result, '应有剩余节点');
  assert.none(result, p => p.server === '2001:db8::1', '不应包含纯IPv6地址');
  assert.lengthOf(result, 5, '排除5个节点后剩余5个');
});

suite.test('排除 jp.sanmaojichang.com 节点', async () => {
  const result = await runScript(pluginFile, {
    args: { jdebug: filterRules },
    proxies: mockProxies,
    debug: false,
  });

  assert.none(result, p => p.server === 'jp.sanmaojichang.com', '不应包含 jp.sanmaojichang.com');
});

suite.test('包含"测试"的节点被排除', async () => {
  const result = await runScript(pluginFile, {
    args: { jdebug: filterRules },
    proxies: mockProxies,
    debug: false,
  });

  assert.none(result, p => p.name.includes('测试'), '不应包含名称中带"测试"的节点');
});

suite.test('验证剩余节点类型分布', async () => {
  const result = await runScript(pluginFile, {
    args: { jdebug: filterRules },
    proxies: mockProxies,
    debug: false,
  });

  const types = {};
  result.forEach(p => {
    types[p.type] = (types[p.type] || 0) + 1;
  });

  assert.hasProperty(types, 'vmess', '应保留 vmess 类型');
  assert.hasProperty(types, 'ss', '应保留 ss 类型');
  assert.hasProperty(types, 'trojan', '应保留 trojan 类型');
});

suite.test('空规则应保留所有节点', async () => {
  const emptyRules = { 'filter-rule': [], 'filter-logic': 'AND' };
  
  const result = await runScript(pluginFile, {
    args: { jdebug: emptyRules },
    proxies: mockProxies,
    debug: false,
  });

  assert.lengthOf(result, mockProxies.length, '应保留全部节点');
});

suite.run();
