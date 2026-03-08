/**
 * Rename (Pass Count) 插件测试 - 使用测试框架
 * 根据测速结果添加成功率标记
 */

const { runScript } = require('./debug-runner');
const { TestSuite, assert } = require('./test-framework');
const path = require('path');
const fs = require('fs');

const pluginFile = '../plugins/4-rename-aggregation.js'

const getFreshProxies = () => [
  { name: '节点A', server: '1.1.1.1', port: 80, type: 'vmess' },
  { name: '节点B', server: '1.1.1.1', port: 443, type: 'vmess' },
  { name: '节点C', server: '8.8.8.8', port: 80, type: 'ss' }
];

const tempCsvPath = path.resolve(__dirname, './temp_connection_count.csv');

const args = { csv_path: tempCsvPath };

const writeCsv = (data) => {
  const csv = [
    'server,port,protocol,pass,notpass,firsttime,updatetime',
    ...data
  ].join('\n');
  fs.writeFileSync(tempCsvPath, csv, 'utf8');
};

const suite = new TestSuite('Rename (Pass Count) Plugin Tests');

suite.afterEach(() => {
  if (fs.existsSync(tempCsvPath)) {
    fs.unlinkSync(tempCsvPath);
  }
});

suite.test('成功率标记与数据更新', async () => {
  // 预设 CSV: A=100%, B=50%, C=0%
  writeCsv([
    '1.1.1.1,80,vmess,10,0,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '1.1.1.1,443,vmess,5,5,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '8.8.8.8,80,ss,0,10,2023-01-01 10:00:00,2023-01-01 10:00:00'
  ]);

  // 第 1 次运行：A=100%
  let result = await runScript(pluginFile, {
    args: { ...args},
    proxies: getFreshProxies(),
    debug: false
  });

  const nodeA1 = result.find(p => p.server === '1.1.1.1' && p.port === 80);
  assert.equals(nodeA1?.name, '10C|100%|节点A', '第 1 次：A=100%');

  // 更新 CSV: A=50%
  writeCsv([
    '1.1.1.1,80,vmess,10,10,2023-01-02 10:00:00,2023-01-02 10:00:00',
    '1.1.1.1,443,vmess,5,5,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '8.8.8.8,80,ss,0,10,2023-01-01 10:00:00,2023-01-01 10:00:00'
  ]);

  // 第 2 次运行：A=50%
  result = await runScript(pluginFile, {
    args: { ...args},
    proxies: getFreshProxies(),
    debug: false
  });

  const nodeA2 = result.find(p => p.server === '1.1.1.1' && p.port === 80);
  assert.equals(nodeA2?.name, '20C|50%|节点A', '第 2 次：A=50%');

  // 再次更新 CSV: A=67% (20/30)
  writeCsv([
    '1.1.1.1,80,vmess,20,10,2023-01-03 10:00:00,2023-01-03 10:00:00',
    '1.1.1.1,443,vmess,5,5,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '8.8.8.8,80,ss,0,10,2023-01-01 10:00:00,2023-01-01 10:00:00'
  ]);

  // 第 3 次运行：A=67%
  result = await runScript(pluginFile, {
    args: { ...args },
    proxies: getFreshProxies(),
    debug: false
  });

  const nodeA3 = result.find(p => p.server === '1.1.1.1' && p.port === 80);
  assert.equals(nodeA3?.name, '30C|67%|节点A', '第 3 次：A=67%');
});

suite.run();
