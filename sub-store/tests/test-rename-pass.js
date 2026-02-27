// sub-store/tests/test-rename-pass.js

const { runScript } = require('./debug-runner');
const path = require('path');
const fs = require('fs');

// 1. 准备 Mock 数据
const getFreshProxies = () => [
  { name: '节点A', server: '1.1.1.1', port: 80, type: 'vmess' },
  { name: '节点B', server: '1.1.1.1', port: 443, type: 'vmess' }, // 重复IP
  { name: '节点C', server: '8.8.8.8', port: 80, type: 'ss' }
];

// 2. 准备 Mock 参数
// 注意：这里使用临时路径，避免污染真实的 CSV
const tempCsvPath = path.resolve(__dirname, './temp_connection_count.csv');

const args = {
  csv_path: tempCsvPath
};

// 3. 运行测试
(async () => {
  console.log('--- 开始测试 RenameAddPassCount ---');

  // 在测试前删除 CSV 文件，确保每次都是从干净的状态开始
  if (fs.existsSync(tempCsvPath)) {
    fs.unlinkSync(tempCsvPath);
  }

  // 关键修复：手动创建 CSV 文件，模拟 Speedtest 已经运行过的结果
  // 节点A: 10 pass, 0 fail -> 100%
  // 节点B: 5 pass, 5 fail -> 50%
  // 节点C: 0 pass, 10 fail -> 0%
  const initialCsvData = [
    'server,port,protocol,pass,notpass,firsttime,updatetime',
    '1.1.1.1,80,vmess,10,0,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '1.1.1.1,443,vmess,5,5,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '8.8.8.8,80,ss,0,10,2023-01-01 10:00:00,2023-01-01 10:00:00'
  ].join('\n');

  fs.writeFileSync(tempCsvPath, initialCsvData, 'utf8');
  console.log('✅ 初始 Mock CSV 文件已创建');

  // --- 第一次运行 ---
  console.log('\n>>> 第一次运行');
  const result1 = await runScript('../plugins/4.2-rename-add-pass-count.js', {
    args: args,
    proxies: getFreshProxies(), // 使用新鲜的节点列表
    debug: true
  });

  if (result1) {
    result1.forEach(p => {
      console.log(`Name: ${p.name.padEnd(20)} | Server: ${p.server}`);
    });
    
    const nodeA = result1.find(p => p.server === '1.1.1.1' && p.port === 80);
    if (nodeA && nodeA.name.startsWith('100%|')) {
        console.log('✅ 测试通过: 节点A 成功率标记正确 (100%)');
    } else {
        console.error('❌ 测试失败: 节点A 标记错误');
    }
  }

  // --- 第二次运行 ---
  console.log('\n>>> 第二次运行测试 (验证数据更新)');
  
  // 模拟 CSV 数据更新 (节点A 变差了)
  // 节点A: 10 pass, 10 fail -> 50%
  const updatedCsvData = [
    'server,port,protocol,pass,notpass,firsttime,updatetime',
    '1.1.1.1,80,vmess,10,10,2023-01-02 10:00:00,2023-01-02 10:00:00', 
    '1.1.1.1,443,vmess,5,5,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '8.8.8.8,80,ss,0,10,2023-01-01 10:00:00,2023-01-01 10:00:00'
  ].join('\n');
  fs.writeFileSync(tempCsvPath, updatedCsvData, 'utf8');
  console.log('✅ Mock CSV 文件已更新');

  const result2 = await runScript('../plugins/4.2-rename-add-pass-count.js', {
    args: args,
    proxies: getFreshProxies(), // 再次使用新鲜的节点列表，避免名字重复叠加 (如 50%|100%|Name)
    debug: false // 关闭详细日志，只看结果
  });

  if (result2) {
    result2.forEach(p => {
      console.log(`Name: ${p.name.padEnd(20)} | Server: ${p.server}`);
    });
    
    const nodeA = result2.find(p => p.server === '1.1.1.1' && p.port === 80);
    if (nodeA && nodeA.name.startsWith('50%|')) {
        console.log('✅ 测试通过: 节点A 更新后成功率标记正确 (50%)');
    } else {
        console.error(`❌ 测试失败: 节点A 更新后标记错误, 实际: ${nodeA ? nodeA.name : '未找到'}`);
    }
  }

  // --- 第三次运行 ---
  console.log('\n>>> 第三次运行测试 (验证再次更新)');
  
  // 模拟 CSV 数据再次更新 (节点A 变好了)
  // 节点A: 20 pass, 10 fail -> 总数 30 -> 20/30 = 66.666...% -> 期望 67%
  const finalCsvData = [
    'server,port,protocol,pass,notpass,firsttime,updatetime',
    '1.1.1.1,80,vmess,20,10,2023-01-03 10:00:00,2023-01-03 10:00:00', 
    '1.1.1.1,443,vmess,5,5,2023-01-01 10:00:00,2023-01-01 10:00:00',
    '8.8.8.8,80,ss,0,10,2023-01-01 10:00:00,2023-01-01 10:00:00'
  ].join('\n');
  fs.writeFileSync(tempCsvPath, finalCsvData, 'utf8');
  console.log('✅ Mock CSV 文件已再次更新');

  const result3 = await runScript('../plugins/4.2-rename-add-pass-count.js', {
    args: args,
    proxies: getFreshProxies(),
    debug: false
  });

  if (result3) {
    const nodeA = result3.find(p => p.server === '1.1.1.1' && p.port === 80);
    if (nodeA && nodeA.name.startsWith('67%|')) {
        console.log('✅ 测试通过: 节点A 再次更新后成功率标记正确 (67%)');
    } else {
        console.error(`❌ 测试失败: 节点A 再次更新后标记错误, 期望 67%|, 实际: ${nodeA ? nodeA.name : '未找到'}`);
    }
  }
})();
