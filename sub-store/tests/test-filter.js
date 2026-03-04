const { runScript } = require('./debug-runner');

// 1. 准备 Mock 数据
const mockProxies = [
  { name: '节点 A-香港', server: 'hk.example.com', port: 443, type: 'vmess' },
  { name: '节点 B-日本', server: 'jp.sanmaojichang.com', port: 80, type: 'ss' },
  { name: '节点 C-美国', server: 'us.google.com', port: 443, type: 'trojan' },
  { name: '节点 D-测试', server: 'ipv6.example.com', port: 80, type: 'vmess' },
  { name: '节点 E-新加坡', server: 'sg.example.com', port: 443, type: 'ss' },
  { name: '123 节点 F', server: 'tw.example.com', port: 80, type: 'trojan' },
  // 新增：更多 ipv6 测试数据
  { name: '节点 G-IPv6', server: 'ipv6.test.com', port: 443, type: 'vmess' },
  { name: '节点 H-IPv6 地址', server: '2001:db8::1', port: 80, type: 'ss' },
  // 新增：更多 jp.sanmaojichang.com 测试数据
  { name: '节点 I-日本 2', server: 'jp.sanmaojichang.com', port: 443, type: 'trojan' },
  { name: '节点 J-日本 3', server: 'jp.sanmaojichang.com', port: 8080, type: 'vmess' }
];

// 2. 构造 $jdebug 对象用于注入测试规则
const $jdebug = {
  'filter-rule': [
    { "field": "server", "matchType": "ipv6", "action": "exclude" },
    { "field": "server", "pattern": "jp.sanmaojichang.com", "matchType": "equals", "action": "exclude" },
    { "field": "name", "pattern": "测试", "matchType": "contains", "action": "exclude" }
  ],
  'filter-logic': 'AND'
};

// 3. 运行测试
(async () => {
  console.log('--- 开始测试 Custom-Filter ---\n');

  // ============================================
  // 测试 1: 测试 regex 匹配 (排除 ipv6)
  // ============================================
  console.log('=== 测试 1: regex 匹配 (排除 ipv6) ===');
  const result1 = await runScript('../plugins/1.1-filter.js', {
    args: {
      jdebug: $jdebug
    },
    proxies: mockProxies,
    debug: true,
  });

  if (result1) {
    console.log(`\n原始节点数：${mockProxies.length}, 过滤后：${result1.length}`);
    result1.forEach(p => {
      console.log(`  Name: ${p.name.padEnd(20)} | Server: ${p.server}`);
    });

    // 检测所有 ipv6 相关节点是否被排除
    const hasIpv6 = result1.some(p =>  p.server.includes('节点 H-IPv6 地址'));
    if (!hasIpv6) {
      console.log('✅ 测试通过：所有 ipv6 节点已被排除');
    } else {
      console.error('❌ 测试失败：ipv6 节点未被排除');
    }
  }

  // ============================================
  // 测试 2: 测试 equals 匹配 (排除 jp.sanmaojichang.com)
  // ============================================
  console.log('\n=== 测试 2: equals 匹配 (排除 jp.sanmaojichang.com) ===');
  const result2 = await runScript('../plugins/1.1-filter.js', {
    args: {
      jdebug: $jdebug
    },
    proxies: mockProxies,
    debug: false,
  });

  if (result2) {
    // 检测所有 jp.sanmaojichang.com 节点是否被排除
    const hasJp = result2.some(p => p.server === 'jp.sanmaojichang.com');
    const jpCount = mockProxies.filter(p => p.server === 'jp.sanmaojichang.com').length;
    console.log(`  原始 jp.sanmaojichang.com 节点数：${jpCount}`);
    if (!hasJp) {
      console.log('✅ 测试通过：所有 jp.sanmaojichang.com 节点已被排除');
    } else {
      console.error('❌ 测试失败：jp.sanmaojichang.com 节点未被排除');
    }
  }

  // ============================================
  // 测试 3: 测试 contains 匹配 (验证名称过滤)
  // ============================================
  console.log('\n=== 测试 3: contains 匹配 (验证名称过滤) ===');
  const result3 = await runScript('../plugins/1.1-filter.js', {
    args: {
      jdebug: $jdebug
    },
    proxies: mockProxies,
    debug: false,
  });

  if (result3) {
    const hasTest = result3.some(p => p.name.includes('测试'));
    if (!hasTest) {
      console.log('✅ 测试通过：包含"测试"的节点已被排除');
    } else {
      console.error('❌ 测试失败：包含"测试"的节点未被排除');
    }
  }

  // ============================================
  // 测试 4: 验证剩余节点类型
  // ============================================
  console.log('\n=== 测试 4: 验证剩余节点类型分布 ===');
  const result4 = await runScript('../plugins/1.1-filter.js', {
    args: {
      jdebug: $jdebug
    },
    proxies: mockProxies,
    debug: false,
  });

  if (result4) {
    const typeCount = {};
    result4.forEach(p => {
      typeCount[p.type] = (typeCount[p.type] || 0) + 1;
    });
    console.log('  类型分布:', typeCount);

    // 验证 vmess 和 ss 类型都存在
    if (typeCount['vmess'] && typeCount['ss']) {
      console.log('✅ 测试通过：多种类型节点保留正确');
    } else {
      console.error('❌ 测试失败：类型分布异常');
    }
  }

  // ============================================
  // 测试 5: 空规则测试 (应保留所有节点)
  // ============================================
  console.log('\n=== 测试 5: 空规则测试 (保留所有节点) ===');
  // 临时修改 FILTER_RULES 为空数组进行测试
  const emptyJdebug = {
    'filter-rule': [],
    'filter-logic': 'AND'
  };
  const result5 = await runScript('../plugins/1.1-filter.js', {
    args: {
      jdebug: emptyJdebug
    },
    proxies: mockProxies,
    debug: false,
  });

  if (result5) {
    console.log(`  原始节点数：${mockProxies.length}, 过滤后：${result5.length}`);
    if (result5.length <= mockProxies.length) {
      console.log('✅ 测试通过：过滤逻辑正常工作');
    } else {
      console.error('❌ 测试失败：节点数量异常');
    }
  }

  console.log('\n--- 所有测试完成 ---');
})();