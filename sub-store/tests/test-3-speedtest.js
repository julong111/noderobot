/**
 * Speedtest 插件测试 - 使用测试框架
 * 在单个测试中运行多次，验证累加逻辑
 */

const { runScript } = require('./debug-runner');
const { TestSuite, assert } = require('./test-framework');
const path = require('path');
const fs = require('fs');

const pluginFile = '../plugins/3-speedtest.js'

const mockProxies = [
  { name: '节点A', server: '1.1.1.1', port: 80, type: 'vmess' },
  { name: '节点B', server: '2.2.2.2', port: 443, type: 'ss' },
  { name: '节点C', server: '3.3.3.3', port: 80, type: 'trojan' }
];

const tempCsvPath = path.resolve(__dirname, './temp_speedtest_result.csv');

const args = {
  csv_path: tempCsvPath,
  timeout: 100,
  concurrency: 1
};

const createMockPing = (outcomes) => ({
  promise: {
    probe: async (host) => ({
      alive: outcomes[host],
      time: outcomes[host] ? 50 : 'unknown'
    })
  }
});

const parseCsvResult = () => {
  const content = fs.readFileSync(tempCsvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim() !== '');
  const header = lines[0].split(',');
  
  const result = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length > 3) {
      result[cols[0]] = {
        pass: parseInt(cols[header.indexOf('pass')]),
        notpass: parseInt(cols[header.indexOf('notpass')])
      };
    }
  }
  return result;
};

const runSpeedtest = async (outcomes) => {
  await runScript(pluginFile, {
    args,
    proxies: mockProxies,
    debug: false,
    modules: { ping: createMockPing(outcomes) }
  });
};

const suite = new TestSuite('Speedtest Plugin Tests');

suite.afterEach(() => {
  if (fs.existsSync(tempCsvPath)) {
    fs.unlinkSync(tempCsvPath);
  }
});

suite.test('多次运行累加测试: A✅B✅C❌ → A✅B❌C❌ → A✅B✅C❌', async () => {
  // 第1次: A✅ B✅ C❌
  await runSpeedtest({ '1.1.1.1': true, '2.2.2.2': true, '3.3.3.3': false });
  
  let result = parseCsvResult();
  assert.equals(result['1.1.1.1'].pass, 1, '第1次: A pass=1');
  assert.equals(result['1.1.1.1'].notpass, 0, '第1次: A notpass=0');
  assert.equals(result['2.2.2.2'].pass, 1, '第1次: B pass=1');
  assert.equals(result['2.2.2.2'].notpass, 0, '第1次: B notpass=0');
  assert.equals(result['3.3.3.3'].pass, 0, '第1次: C pass=0');
  assert.equals(result['3.3.3.3'].notpass, 1, '第1次: C notpass=1');

  // 第2次: A✅ B❌ C❌
  await runSpeedtest({ '1.1.1.1': true, '2.2.2.2': false, '3.3.3.3': false });
  
  result = parseCsvResult();
  assert.equals(result['1.1.1.1'].pass, 2, '第2次: A pass=2 (累加)');
  assert.equals(result['1.1.1.1'].notpass, 0, '第2次: A notpass=0');
  assert.equals(result['2.2.2.2'].pass, 1, '第2次: B pass=1');
  assert.equals(result['2.2.2.2'].notpass, 1, '第2次: B notpass=1 (新增失败)');
  assert.equals(result['3.3.3.3'].pass, 0, '第2次: C pass=0');
  assert.equals(result['3.3.3.3'].notpass, 2, '第2次: C notpass=2 (累加)');

  // 第3次: A✅ B✅ C❌
  await runSpeedtest({ '1.1.1.1': true, '2.2.2.2': true, '3.3.3.3': false });
  
  result = parseCsvResult();
  assert.equals(result['1.1.1.1'].pass, 3, '第3次: A pass=3 (最终)');
  assert.equals(result['1.1.1.1'].notpass, 0, '第3次: A notpass=0');
  assert.equals(result['2.2.2.2'].pass, 2, '第3次: B pass=2 (1+1)');
  assert.equals(result['2.2.2.2'].notpass, 1, '第3次: B notpass=1 (保持)');
  assert.equals(result['3.3.3.3'].pass, 0, '第3次: C pass=0');
  assert.equals(result['3.3.3.3'].notpass, 3, '第3次: C notpass=3 (最终)');
});

suite.test('单次运行: 全部存活', async () => {
  await runSpeedtest({ '1.1.1.1': true, '2.2.2.2': true, '3.3.3.3': true });
  
  const result = parseCsvResult();
  assert.equals(result['1.1.1.1'].pass, 1, 'A pass=1');
  assert.equals(result['2.2.2.2'].pass, 1, 'B pass=1');
  assert.equals(result['3.3.3.3'].pass, 1, 'C pass=1');
});

suite.test('单次运行: 全部失败', async () => {
  await runSpeedtest({ '1.1.1.1': false, '2.2.2.2': false, '3.3.3.3': false });
  
  const result = parseCsvResult();
  assert.equals(result['1.1.1.1'].notpass, 1, 'A notpass=1');
  assert.equals(result['2.2.2.2'].notpass, 1, 'B notpass=1');
  assert.equals(result['3.3.3.3'].notpass, 1, 'C notpass=1');
});

suite.test('Mock Ping: 存活返回延迟', async () => {
  const mockPing = createMockPing({ '1.1.1.1': true });
  const result = await mockPing.promise.probe('1.1.1.1');
  
  assert.isTrue(result.alive, '存活节点 alive=true');
  assert.equals(result.time, 50, '存活节点返回延迟50ms');
});

suite.test('Mock Ping: 失败返回 unknown', async () => {
  const mockPing = createMockPing({ '1.1.1.1': false });
  const result = await mockPing.promise.probe('1.1.1.1');
  
  assert.isFalse(result.alive, '失败节点 alive=false');
  assert.equals(result.time, 'unknown', '失败节点返回unknown');
});

suite.run();
