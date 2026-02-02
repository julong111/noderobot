/**
 * Sub-Store 脚本: 将所有节点保存为 JSON 文件
 *
 * 逻辑：将所有节点保存为 JSON 文件。
 *
 * 参数:
 * - output_path: 输出 JSON 文件的路径 (默认: /Users/julong/Projects/noderobot/s/all_nodes.json)
 */

function operator(proxies = [], targetPlatform, context) {
  const $ = $substore;
  const fs = eval('require("fs")');

  // 参数处理
  const outputPath = $arguments.output_path || './all_nodes.json';

  // 复用高性能时间函数
  const getTime = (() => {
    let lastSecond = 0;
    let cachedPrefix = '';
    return () => {
      const now = Date.now();
      const ms = now % 1000;
      const second = (now / 1000) | 0;
      if (second !== lastSecond) {
        lastSecond = second;
        const d = new Date(now);
        const m = d.getMonth() + 1;
        const date = d.getDate();
        const h = d.getHours();
        const min = d.getMinutes();
        const s = d.getSeconds();
        cachedPrefix = `${d.getFullYear()}-${m < 10 ? '0' + m : m}-${date < 10 ? '0' + date : date} ` +
                       `${h < 10 ? '0' + h : h}:${min < 10 ? '0' + min : min}:${s < 10 ? '0' + s : s}`;
      }
      if (ms < 10) return cachedPrefix + '.00' + ms;
      if (ms < 100) return cachedPrefix + '.0' + ms;
      return cachedPrefix + '.' + ms;
    };
  })();

  $.info(`[${getTime()}] [SaveNodes] Start --------------------------------------`);
  $.info(`[${getTime()}] [SaveNodes] Output Path: ${outputPath}`);

  fs.writeFileSync(outputPath, JSON.stringify(proxies, null, 2), 'utf8');
  $.info(`[${getTime()}] [SaveNodes] Saved ${proxies.length} nodes to ${outputPath}`);
  $.info(`[${getTime()}] [SaveNodes] End --------------------------------------`);
}