const { runScript } = require('./debug-runner');
const path = require('path');
const fs = require('fs');

// 1. 准备 Mock 数据
const mockProxies = [
  { name: '节点A', server: '1.1.1.1', port: 80, type: 'vmess' },
  { name: '节点B', server: '1.1.1.1', port: 443, type: 'vmess' }, // 重复IP
  { name: '节点C', server: '8.8.8.8', port: 80, type: 'ss' }
];

// 2. 准备 Mock 参数
// 注意：这里使用临时路径，避免污染真实的 CSV
const tempCsvPath = path.resolve(__dirname, './temp_server_count.csv');

const args = {
  csv_path: tempCsvPath
};

// 3. 运行测试
(async () => {
  console.log('--- 开始测试 RenameByServerCount ---');

  // 在测试前删除 CSV 文件，确保每次都是从干净的状态开始
  if (fs.existsSync(tempCsvPath)) {
    fs.unlinkSync(tempCsvPath);
  }

  const result = await runScript('../plugins/3-rename-ip-count.js', {
    args: args,
    proxies: mockProxies,
    debug: true
  });

  // 4. 验证结果 (断言)
  console.log('\n--- 测试结果验证 ---');
  if (result) {
    result.forEach(p => {
      console.log(`Name: ${p.name.padEnd(20)} | Server: ${p.server}`);
    });

    // 简单的自动断言
    const nodeA = result.find(p => p.server === '1.1.1.1');
    if (nodeA && nodeA.name.includes('2C|')) {
      console.log('✅ 测试通过: 1.1.1.1 计数正确 (2C)');
    } else {
      console.error('❌ 测试失败: 1.1.1.1 计数错误');
    }
  }

  console.log('\n--- 第二次运行测试 (验证累加) ---');
  // 再次运行脚本，模拟第二次调度
  const result2 = await runScript('../plugins/3-rename-ip-count.js', {
    args: args,
    proxies: mockProxies,
    debug: false // 关闭详细日志，只看结果
  });

  if (result2) {
    const nodeA = result2.find(p => p.server === '1.1.1.1');
    // 第一次运行后 CSV 中 count=2，第二次运行输入又有两个 1.1.1.1，所以总数应为 4
    if (nodeA && nodeA.name.includes('4C|')) {
      console.log('✅ 测试通过: 1.1.1.1 累加计数正确 (4C)');
    } else {
      console.error(`❌ 测试失败: 1.1.1.1 累加计数错误, 期望 4C, 实际: ${nodeA ? nodeA.name : '未找到'}`);
    }
  }

  console.log('\n--- 第三次运行测试 (验证累加) ---');
  // 再次运行脚本，模拟第三次调度
  const result3 = await runScript('../plugins/3-rename-ip-count.js', {
    args: args,
    proxies: mockProxies,
    debug: false // 关闭详细日志，只看结果
  });

  if (result3) {
    const nodeA = result3.find(p => p.server === '1.1.1.1');
    // 第一次运行后 CSV 中 count=2，第二次运行输入又有两个 1.1.1.1，所以总数应为 4
    if (nodeA && nodeA.name.includes('6C|')) {
      console.log('✅ 测试通过: 1.1.1.1 累加计数正确 (6C)');
    } else {
      console.error(`❌ 测试失败: 1.1.1.1 累加计数错误, 期望 6C, 实际: ${nodeA ? nodeA.name : '未找到'}`);
    }
  }
})();