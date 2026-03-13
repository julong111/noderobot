async function operator(proxies, targetPlatform, context) {
  // 1. 显式加载内置的 YAML 解析库
  // 这个是Sub-Store环境的标准做法，能完美替代未挂载的$.parse
  const YAML = require('js-yaml');
  const $ = $substore;

  const proxy = $arguments.proxy;
  if (!proxy) {
    proxy = '';
  }
  const getFormatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  const now = new Date();
  const todayStr = getFormatDate(now);
  const yesterdayStr = getFormatDate(new Date(now.getTime() - 86400000));

  const baseUrl = proxy + "https://raw.githubusercontent.com/free-nodes/clashfree/refs/heads/main/";

  const urls = [
    { name: "今日文件", url: `${baseUrl}clash${todayStr}.yml` },
    { name: "昨日备选", url: `${baseUrl}clash${yesterdayStr}.yml` }
  ];

  console.log(`[Sub-Store 日志] === 开始启用内置工具解析 ===`);
  console.log(`[Link] ${baseUrl}`);
  let content = "";
  for (const item of urls) {
    try {
      console.log(`[Sub-Store 日志] 正在请求: ${item.url}`);
      const response = await $.http.get({
        url: item.url,
        timeout: 10000
      });

      if (response.statusCode === 200) {
        content = response.body;
        if (content && content.trim().length > 10) {
          console.log(`[Sub-Store 日志] ✅ 成功获取原始文本，长度: ${content.length}`);
          break;
        }
      }
    } catch (e) {
      console.log(`[Sub-Store 日志] 💥 请求报错: ${e.message}`);
    }
  }

  if (!content) {
    console.log(`[Sub-Store 日志] ⛔ 无法获取数据`);
    return [];
  }

  // --- 标准、完美解析核心逻辑 ---
  console.log(`[Sub-Store 日志] 正在使用 js-yaml 库解析 YAML...`);

  try {
    // 2. 使用加载的 YAML 库将文本转换为 JS 对象
    const parsedData = YAML.load(content);

    if (!parsedData) throw new Error("解析内容为空");

    // 3. 提取标准 proxies 数组
    let nodeArray = [];
    if (Array.isArray(parsedData)) {
      nodeArray = parsedData;
    } else if (parsedData.proxies && Array.isArray(parsedData.proxies)) {
      nodeArray = parsedData.proxies;
    } else if (parsedData.proxy && Array.isArray(parsedData.proxy)) {
      nodeArray = parsedData.proxy;
    } else {
      // 遍历对象寻找潜在的 proxies 数组
      for (let key in parsedData) {
        if (Array.isArray(parsedData[key])) {
          nodeArray = parsedData[key];
          break;
        }
      }
    }

    console.log(`[Sub-Store 日志] 🎉 完美解析，共提取节点数: ${nodeArray.length}`);

    // 检查数组有效性，确保 Sub-Store 不会报错
    if (!Array.isArray(nodeArray)) {
      console.log(`[Sub-Store 日志] 💣 错误：提取的节点结构不是 Array`);
      return [];
    }

    // 返回标准 JS 数组对象，完美兼容 e.filter
    return nodeArray;

  } catch (e) {
    console.log(`[Sub-Store 日志] 💥 解析运行错误: ${e.message}`);
    return [];
  }
}