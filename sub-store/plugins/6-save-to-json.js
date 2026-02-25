/**
 * Sub-Store 脚本: 将所有节点保存为 JSON 文件
 *
 * 逻辑：将所有节点保存为 JSON 文件。
 *
 * 参数:
 * - output_path: 输出 JSON 文件的路径 (默认: /Users/julong/Projects/noderobot/s/all_nodes.json)
 */

async function operator(proxies = [], targetPlatform, context) {
  const { log, performance } = $substore.julong;
  const fs = require('fs');
  const scriptName = 'SaveNodes';

  // 参数处理
  const outputPath = $arguments.output_path || './all_nodes.json';

  performance.startTimer(scriptName);
  log.info(scriptName, 'Start --------------------------------------');
  log.info(scriptName, `Output Path: ${outputPath}`);

  try {
    fs.writeFileSync(outputPath, JSON.stringify(proxies, null, 2), 'utf8');
    log.info(scriptName, `Saved ${proxies.length} nodes to ${outputPath}`);
  } catch (e) {
    log.error(scriptName, `Failed to save nodes: ${e.message}`);
  }

  const totalTime = performance.formatDuration(performance.endTimer(scriptName));
  log.info(scriptName, `End. Total time: ${totalTime} --------------------------------------`);
}