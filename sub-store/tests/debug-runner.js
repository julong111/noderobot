const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * 模拟 Sub-Store 环境运行脚本
 * @param {string} scriptPath - 目标脚本的相对路径或绝对路径
 * @param {object} options - 配置项
 * @param {object} options.args - 模拟 $arguments
 * @param {array} options.proxies - 模拟输入的节点列表
 * @param {boolean} options.debug - 是否开启详细日志
 * @param {object} options.modules - 注入自定义模块 (如 http)
 */
async function runScript(scriptPath, options = {}) {
  const { args = {}, proxies = [], debug = true, modules = {} } = options;

  // 1. 初始化模拟的全局对象 $substore
  const $substore = {
    cache: {}, // 简单的缓存模拟
    info: debug ? console.log : () => {},
    error: debug ? console.error : () => {},
    notify: debug ? (t, s, c) => console.log(`[Notify] ${t} ${s} ${c}`) : () => {},
    log: {
      info: debug ? console.log : () => {},
      error: debug ? console.error : () => {},
      debug: debug ? console.debug : () => {},
      columns: debug ? console.table : () => {}
    },
    // 模拟 http 模块 (如果脚本用到)
    http: modules.http || {
      get: async (opts) => {
        console.log(`[Mock HTTP] GET: ${opts.url}`);
        return { statusCode: 200, body: '' }; // 需要根据测试需求 mock 返回值
      }
    }
  };

  // 2. 创建沙箱上下文
  // 我们把 Node.js 的 require 传进去，这样脚本里 require('fs') 也能工作
  const sandbox = {
    $substore,
    $arguments: args,
    console: console,
    require: (id) => {
      if (modules && modules[id]) return modules[id];
      return require(id);
    },
    module: { exports: {} },
    exports: {},
    process: process, // 某些脚本可能检测 process.platform
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Buffer,
    URL
  };

  vm.createContext(sandbox);

  // 3. 加载依赖库 (0-julong.js)
  // 假设 0-julong.js 在 plugins 目录下，根据实际情况调整路径
  const julongPath = path.resolve(__dirname, '../plugins/0-julong.js');
  if (fs.existsSync(julongPath)) {
    const julongCode = fs.readFileSync(julongPath, 'utf8');
    try {
      // 在沙箱中运行库代码
      vm.runInContext(julongCode, sandbox);

      // 关键：手动触发 julong 的 operator 以初始化 $substore.julong
      // 因为 0-julong.js 的逻辑是：运行 operator 时检查并挂载工具
      if (typeof sandbox.operator === 'function') {
        await sandbox.operator([], 'Node', {});
        if (debug) console.log('✅ [System] Julong library initialized.');
      }
    } catch (e) {
      console.error('❌ [System] Failed to load 0-julong.js:', e);
    }
  }

  // 4. 加载目标脚本
  const targetScriptFullPath = path.resolve(__dirname, scriptPath);
  if (!fs.existsSync(targetScriptFullPath)) {
    throw new Error(`Script not found: ${targetScriptFullPath}`);
  }
  const scriptCode = fs.readFileSync(targetScriptFullPath, 'utf8');

  try {
    // 在同一个沙箱中运行目标脚本，它会覆盖之前的 operator 函数定义
    vm.runInContext(scriptCode, sandbox);
  } catch (e) {
    console.error('❌ [System] Syntax Error in target script:', e);
    return;
  }

  // 5. 执行目标脚本的 operator
  if (typeof sandbox.operator === 'function') {
    console.log(`🚀 [System] Running script: ${path.basename(scriptPath)}`);
    const startTime = Date.now();

    try {
      // 传入模拟数据
      const result = await sandbox.operator(proxies, 'Node', {});

      const duration = Date.now() - startTime;
      console.log(`\n✨ [System] Execution finished in ${duration}ms`);
      return result;
    } catch (e) {
      console.error('❌ [System] Runtime Error:', e);
    }
  } else {
    console.error('❌ [System] No "operator" function found in script.');
  }
}

module.exports = { runScript };


// 示例使用方法 (你可以把这个放在一个单独的 test.js 文件里)
if (require.main === module) {
  (async () => {
    const mockProxies = [
      { name: '节点A', server: '1.1.1.1', port: 80, type: 'vmess' },
      { name: '节点B', server: '1.1.1.1', port: 443, type: 'vmess' }, // 重复IP
      { name: '节点C', server: '8.8.8.8', port: 80, type: 'ss' }
    ];

    const args = {
      csv_path: './temp_server_count.csv'  // 相对路径，会在 test 目录下生成
    };

    console.log('--- 开始测试 RenameByServerCount ---');

    const result = await runScript('../plugins/3-rename-ip-count.js', {
      args: args,
      proxies: mockProxies,
      debug: true
    });

    if (result) {
      console.log('\n--- 测试结果 ---');
      result.forEach(p => console.log(p.name));
    }
  })();
}