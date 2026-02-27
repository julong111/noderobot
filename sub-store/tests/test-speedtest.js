// sub-store/tests/test-speedtest.js

const { runScript } = require('./debug-runner');
const path = require('path');
const fs = require('fs');

// 1. 准备 Mock 数据
const mockProxies = [
  { name: '节点A', server: '1.1.1.1', port: 80, type: 'vmess' },
  { name: '节点B', server: '2.2.2.2', port: 443, type: 'ss' },
  { name: '节点C', server: '3.3.3.3', port: 80, type: 'trojan' }
];

// 2. 准备 Mock 参数
const tempCsvPath = path.resolve(__dirname, './temp_speedtest_result.csv');

const args = {
  csv_path: tempCsvPath,
  timeout: 100, // 模拟超时设置
  concurrency: 1 // 串行方便调试
};

// 3. 辅助函数：创建 Mock Ping 模块
// 根据传入的 outcomes 对象决定每个 IP 的死活
const createMockPing = (outcomes) => {
  return {
    promise: {
      probe: async (host, options) => {
        const isAlive = outcomes[host];
        return { 
          alive: isAlive, 
          time: isAlive ? 50 : 'unknown' // 活着的节点返回 50ms 延迟
        };
      }
    }
  };
};

// 4. 辅助函数：验证 CSV 数据
const verifyCsvCounts = (runName, expectedMap) => {
  if (!fs.existsSync(tempCsvPath)) {
    console.error(`❌ [${runName}] CSV 文件未生成`);
    return;
  }

  const content = fs.readFileSync(tempCsvPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim() !== '');
  
  // 解析 CSV (假设 header 是第一行)
  // server,port,protocol,pass,notpass,...
  const header = lines[0].split(',');
  const passIdx = header.indexOf('pass');
  const notPassIdx = header.indexOf('notpass');
  const serverIdx = header.indexOf('server');

  let allPassed = true;

  console.log(`\n🔍 [${runName}] 验证结果:`);
  
  Object.keys(expectedMap).forEach(server => {
    const line = lines.find(l => l.startsWith(server + ','));
    if (!line) {
      console.error(`   ❌ 节点 ${server} 数据行未找到`);
      allPassed = false;
      return;
    }

    const cols = line.split(',');
    const actualPass = parseInt(cols[passIdx]);
    const actualNotPass = parseInt(cols[notPassIdx]);
    const expected = expectedMap[server];

    if (actualPass === expected.pass && actualNotPass === expected.notpass) {
      console.log(`   ✅ 节点 ${server}: Pass=${actualPass}, Fail=${actualNotPass}`);
    } else {
      console.error(`   ❌ 节点 ${server}: 期望 Pass=${expected.pass}/Fail=${expected.notpass}, 实际 Pass=${actualPass}/Fail=${actualNotPass}`);
      allPassed = false;
    }
  });

  if (allPassed) console.log(`   ✨ [${runName}] 所有验证通过`);
};

// 5. 主测试流程
(async () => {
  console.log('--- 开始测试 Speedtest Script ---');

  // 清理旧文件
  if (fs.existsSync(tempCsvPath)) {
    fs.unlinkSync(tempCsvPath);
  }

  // --- 第一次运行 ---
  // 模拟: A pass, B pass, C fail
  console.log('\n>>> 第一次运行: A(✅), B(✅), C(❌)');
  await runScript('../plugins/4-speedtest.js', {
    args: args,
    proxies: mockProxies,
    debug: false,
    modules: { 'ping': createMockPing({ '1.1.1.1': true, '2.2.2.2': true, '3.3.3.3': false }) }
  });

  verifyCsvCounts('Run 1', {
    '1.1.1.1': { pass: 1, notpass: 0 },
    '2.2.2.2': { pass: 1, notpass: 0 },
    '3.3.3.3': { pass: 0, notpass: 1 }
  });

  // --- 第二次运行 ---
  // 模拟: A pass, B fail, C fail
  console.log('\n>>> 第二次运行: A(✅), B(❌), C(❌)');
  await runScript('../plugins/4-speedtest.js', {
    args: args,
    proxies: mockProxies,
    debug: false,
    modules: { 'ping': createMockPing({ '1.1.1.1': true, '2.2.2.2': false, '3.3.3.3': false }) }
  });

  verifyCsvCounts('Run 2', {
    '1.1.1.1': { pass: 2, notpass: 0 }, // 1+1
    '2.2.2.2': { pass: 1, notpass: 1 }, // 1+0 (fail)
    '3.3.3.3': { pass: 0, notpass: 2 }  // 0+0 (fail)
  });

  // --- 第三次运行 ---
  // 模拟: A pass, B pass, C fail
  console.log('\n>>> 第三次运行: A(✅), B(✅), C(❌)');
  await runScript('../plugins/4-speedtest.js', {
    args: args,
    proxies: mockProxies,
    debug: false,
    modules: { 'ping': createMockPing({ '1.1.1.1': true, '2.2.2.2': true, '3.3.3.3': false }) }
  });

  verifyCsvCounts('Run 3', {
    '1.1.1.1': { pass: 3, notpass: 0 }, // 2+1
    '2.2.2.2': { pass: 2, notpass: 1 }, // 1+1
    '3.3.3.3': { pass: 0, notpass: 3 }  // 0+0 (fail)
  });
})();
