/**
 * Filter-Ping-Rate 插件测试 - 使用测试框架
 * 过滤规则: rate < rate参数 且 count >= count参数 的节点应被过滤
 */

const { runScript } = require('./debug-runner');
const { TestSuite, assert } = require('./test-framework');

const pluginFile = '../plugins/5-conditional-filter.js'

const mockProxies = [
  { name: '5C|10%|节点A', server: '1.1.1.1', port: 80, type: 'vmess' },   // rate=10,count=5  → 不过滤
  { name: '10C|30%|节点B', server: '1.1.1.1', port: 443, type: 'vmess' },  // rate=30,count=10 → 过滤
  { name: '15C|25%|节点C', server: '8.8.8.8', port: 80, type: 'ss' },      // rate=25,count=15 → 过滤
  { name: '4C|50%|节点D', server: '8.8.4.4', port: 80, type: 'ss' },       // rate=50,count=5  → 不过滤
  { name: '节点E', server: '8.8.4.4', port: 80, type: 'ss' },              // 无匹配            → 不过滤
  { name: '12C|20%|节点F', server: '8.8.4.4', port: 80, type: 'ss' },      // rate=20,count=12 → 过滤
  { name: '9C|30%|节点G', server: '8.8.4.4', port: 80, type: 'ss' }        // rate=30,count=9  → 不过滤
];

const args = {
  rate: 30,
  count: 10
};

const suite = new TestSuite('Filter-Ping-Rate Plugin Tests');

suite.test('count>=10 且 rate<=30  的节点被过滤', async () => {
  const result = await runScript(pluginFile, {
    args,
    proxies: mockProxies,
    debug: false
  });

  // 验证总数
  assert.lengthOf(result, 4, '应过滤1个节点(B,C,F), 剩余4个');

  // 节点 A: count=5<10 应保留
  assert.notEquals(result.find(p => p.name === '5C|10%|节点A'), undefined, '节点 A(count<10) 应保留');

  // 节点 B: rate=30<=30 且 count=10>=10 应过滤
  assert.equals(result.find(p => p.name === '10C|30%|节点B'), undefined, '节点 B(rate<=30 且 count>=10) 应过滤');

  // 节点 C: rate<30 且 count>=10 应过滤
  assert.equals(result.find(p => p.name === '15C|25%|节点C'), undefined, '节点 C 应被过滤');

  // 节点D: count=5<10 应保留
  assert.notEquals(result.find(p => p.name === '4C|50%|节点D'), undefined, '节点D(count<10)应保留');

  // 节点E: 无匹配 应保留
  assert.notEquals(result.find(p => p.name === '节点E'), undefined, '节点E(无匹配)应保留');

  // 节点F: rate<30且count>=10 应过滤
  assert.equals(result.find(p => p.name === '12C|20%|节点F'), undefined, '节点F应被过滤');

  // 节点G: count=9<10 应保留
  assert.notEquals(result.find(p => p.name === '9C|30%|节点G'), undefined, '节点G(count<10)应保留');
});

suite.test('自定义参数: rate<50 且 count>=5', async () => {
  const customArgs = { rate: 50, count: 5 };

  const result = await runScript(pluginFile, {
    args: customArgs,
    proxies: mockProxies,
    debug: false
  });

  // count>=5: A(5), B(10), C(15), F(12), G(9)
  // rate<=50: A(10), C(25), F(20), G(30) 
  // 综合: rate<=50 AND count>=5: A, C, D, F, G = 4个被过滤, 剩余3个
  assert.lengthOf(result, 2, 'count>=5 && rate<=50  应过滤5个(A,B,C,F,G),剩D,E');
});

suite.run();
