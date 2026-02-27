const { runScript } = require('./debug-runner');
const path = require('path');

// 1. 准备 Mock 数据
const mockProxies = [
  { name: '10%|5C|节点A', server: '1.1.1.1', port: 80, type: 'vmess' }, // Should NOT be filtered (Count < 10)
  { name: '30%|10C|节点B', server: '1.1.1.1', port: 443, type: 'vmess' }, // Should not be filtered
  { name: '25%|15C|节点C', server: '8.8.8.8', port: 80, type: 'ss' },   // Should be filtered
  { name: '50%|5C|节点D', server: '8.8.4.4', port: 80, type: 'ss' },    // Should not be filtered
  { name: '节点E', server: '8.8.4.4', port: 80, type: 'ss' },         // Should not be filtered (no match)
  { name: '20%|12C|节点F', server: '8.8.4.4', port: 80, type: 'ss' },    // Should be filtered
  { name: '30%|9C|节点G', server: '8.8.4.4', port: 80, type: 'ss' }     // Should not be filtered
];

// 2. 运行测试
(async () => {
  console.log('--- 开始测试 FilterPingRate ---');

  const result = await runScript('../plugins/5-filter-ping-rate.js', {
    proxies: mockProxies,
    debug: true
  });

  // 3. 验证结果 (断言)
  console.log('\n--- 测试结果验证 ---');
  if (result) {
    result.forEach(p => {
      console.log(`Name: ${p.name.padEnd(20)} | Server: ${p.server}`);
    });

    // 简单的自动断言
    const filteredCount = result.length;
    const expectedCount = mockProxies.filter(proxy => {
      const match = proxy.name?.match(/(\d+)%\|(\d+)C\|/);
      if (match) {
        const rate = parseInt(match[1]);
        const count = parseInt(match[2]);
        return !(rate < 30 && count >= 10);
      }
      return true;
    }).length;

    if (filteredCount === expectedCount) {
      console.log(`✅ 测试通过: 过滤数量正确 (Expected: ${expectedCount}, Actual: ${filteredCount})`);
    } else {
      console.error(`❌ 测试失败: 过滤数量错误 (Expected: ${expectedCount}, Actual: ${filteredCount})`);
    }

    // Check specific nodes are filtered or not
    const nodeA = result.find(p => p.name === '10%|5C|节点A');
    if (nodeA !== undefined) {
        console.log('✅ 测试通过: 节点A (10%|5C|节点A) 未被过滤 (Count < 10)');
    } else {
        console.error('❌ 测试失败: 节点A (10%|5C|节点A) 被错误过滤');
    }

      const nodeB = result.find(p => p.name === '30%|10C|节点B');
      if (nodeB !== undefined) {
          console.log('✅ 测试通过: 节点B (30%|10C|节点B) 没有被过滤');
      } else {
          console.error('❌ 测试失败: 节点B (30%|10C|节点B) 被过滤');
      }

  } else {
    console.error('❌ 测试失败: runScript 返回 null 或 undefined');
  }

  console.log('\n--- 测试结束 FilterPingRate ---');
})();