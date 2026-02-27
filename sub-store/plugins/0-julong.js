/**
 * Sub-Store 自定义工具函数库 - Julong模块
 * 为其他脚本提供共享的工具函数
 */
async function operator(proxies = [], targetPlatform, context) {

    // 初始化Julong工具对象（只在第一次运行时创建）
    const $ = $substore;
    if (!$.julong) {
        $.julong = {
            // 日志工具
            log: {
                info: (module, message) => {
                    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
                    console.info(`[${timestamp}] [${module}] ${message}`);
                },

                debug: (module, message) => {
                    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
                    console.debug(`[${timestamp}] [${module}] ${message}`);
                },

                error: (module, message) => {
                    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
                    console.error(`[${timestamp}] [${module}] ${message}`);
                },

                // 格式化列打印 (用于对齐日志)
                columns: (module, cols) => {
                    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
                    const message = cols.map(col => {
                        const val = col.text;
                        const text = (val !== undefined && val !== null) ? String(val) : '';
                        const width = col.width || 0;
                        const align = col.align || 'left';
                        if (!width) return text;
                        return align === 'right' ? text.padStart(width) : text.padEnd(width);
                    }).join(' ');
                    console.info(`[${timestamp}] [${module}] ${message}`);
                }
            },

            // 性能监控工具
            performance: {
                // 开始计时器
                startTimer: (name = 'default') => {
                    if (!$.julong.performance._timers) {
                        $.julong.performance._timers = new Map();
                    }
                    $.julong.performance._timers.set(name, Date.now());
                },

                // 结束计时器并返回耗时（毫秒）
                endTimer: (name = 'default') => {
                    if (!$.julong.performance._timers) return -1;

                    const startTime = $.julong.performance._timers.get(name);
                    if (startTime === undefined) return -1;

                    const elapsed = Date.now() - startTime;
                    $.julong.performance._timers.delete(name);
                    return elapsed;
                },

                // 格式化耗时显示
                formatDuration: (ms) => {
                    if (ms < 1000) return `${ms}ms`;
                    const seconds = (ms / 1000).toFixed(2);
                    return `${seconds}s`;
                },

                // 获取当前时间戳（用于日志）
                getTime: () => {
                    const now = Date.now();
                    const date = new Date(now);

                    // 格式化日期时间
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    const seconds = String(date.getSeconds()).padStart(2, '0');
                    const milliseconds = String(now % 1000).padStart(3, '0');

                    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
                }
            },


            // 网络工具
            network: {
                isIPv6: (address) => {
                    if (!address) return false;
                    address = address.trim();

                    // 处理带方括号的IPv6格式 [2001:db8::1]
                    if (address.startsWith('[') && address.endsWith(']')) {
                        address = address.slice(1, -1);
                    }

                    // IPv6正则表达式 - 匹配标准IPv6格式
                    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;

                    return ipv6Regex.test(address);
                },

                isIPv4: (address) => {
                    if (!address) return false;
                    address = address.trim();

                    // IPv4正则表达式
                    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
                    if (!ipv4Regex.test(address)) return false;

                    // 验证每个数字在0-255范围内
                    const parts = address.split('.');
                    return parts.every(part => {
                        const num = parseInt(part, 10);
                        return num >= 0 && num <= 255;
                    });
                },

                isURL: (str) => {
                    if (!str) return false;

                    try {
                        // 先尝试用URL构造函数验证
                        new URL(str);
                        return true;
                    } catch {
                        // 如果URL构造失败，用正则表达式进一步验证
                        const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
                        return urlRegex.test(str);
                    }
                },

                // 检查服务器地址类型
                checkServerType: (serverStr) => {
                    if (!serverStr) return null;

                    // 优先检查URL（因为URL可能包含IP地址）
                    if ($.julong.network.isURL(serverStr)) {
                        return 'url';
                    }

                    // 检查IPv6
                    if ($.julong.network.isIPv6(serverStr)) {
                        return 'ipv6';
                    }

                    // 最后检查IPv4
                    if ($.julong.network.isIPv4(serverStr)) {
                        return 'ipv4';
                    }

                    // 如果都不匹配，返回null
                    return null;
                }
            },

            // CSV工具
            csv: {
                /**
                 * 通用的CSV操作函数，用于新增或更新一行数据
                 * @param {string} csvPath - CSV文件路径
                 * @param {object} item - 要新增或更新的数据对象
                 * @param {function} callback - 回调函数，用于处理数据合并 (existingItem, newItem) => mergedItem
                 * @param {string[]} columns - CSV文件的列头数组
                 * @param {string[]} keys - 用于构成唯一键的列名数组
                 * @param {string[]} updates - 需要更新的列名数组
                 */
                operate: async (csvPath, item, callback, columns, keys, updates, allData = null) => {
                    const fs = require('fs');

                    // 参数校验
                    if (!columns || !Array.isArray(columns) || columns.length === 0) throw new Error('Columns parameter is required');
                    if (!keys || !Array.isArray(keys) || keys.length === 0) throw new Error('Keys parameter is required');
                    if (!updates || !Array.isArray(updates) || updates.length === 0) throw new Error('Updates parameter is required');

                    const headerLine = columns.join(',');

                    // 检查文件是否存在
                    if (!fs.existsSync(csvPath)) {
                        fs.writeFileSync(csvPath, '\uFEFF' + headerLine + '\n', 'utf8');
                    }

                    let existingData = allData;

                    if (!existingData) {
                        // 读取并验证
                        const content = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
                        const lines = content.split(/\r?\n/).filter(line => line.trim() !== '');

                        if (lines.length > 0) {
                            const fileCols = lines[0].trim().split(',');
                            if (fileCols.length !== columns.length) {
                                throw new Error(`Column count mismatch: expected ${columns.length}, got ${fileCols.length}`);
                            }
                        }

                        // 解析数据
                        existingData = [];
                        for (let i = 1; i < lines.length; i++) {
                            const values = lines[i].split(',');
                            const row = {};
                            columns.forEach((col, idx) => {
                                row[col] = values[idx] !== undefined ? values[idx] : '';
                            });
                            existingData.push(row);
                        }
                    }

                    // 解析数据
                    // 构建查找键
                    const genKey = (obj) => keys.map(k => String(obj[k] || '')).join('|');
                    const itemKey = genKey(item);

                    const index = existingData.findIndex(row => genKey(row) === itemKey);

                    if (index === -1) {
                        // 新增
                        let newItem = { ...item };
                        if (callback) {
                            const res = callback(null, newItem);
                            if (res) newItem = res;
                        }
                        // 补全字段
                        const finalItem = {};
                        columns.forEach(col => finalItem[col] = newItem[col] !== undefined ? newItem[col] : '');
                        existingData.push(finalItem);

                    } else {
                        // 更新
                        const existingItem = existingData[index];
                        let merged = { ...existingItem };

                        if (callback) {
                            const res = callback(existingItem, item);
                            if (res) merged = res;
                        }

                        // 关键：只更新 updates 中定义的字段，防止覆盖其他数据
                        updates.forEach(key => {
                            if (merged[key] !== undefined) {
                                existingItem[key] = merged[key];
                            }
                        });
                    }
                    return existingData;
                },

                save: (csvPath, columns, existingData) => {
                    const fs = require('fs');
                    const headerLine = columns.join(',');
                    const output = [headerLine];
                    existingData.forEach(row => {
                        output.push(columns.map(c => row[c]).join(','));
                    });
                    fs.writeFileSync(csvPath, '\uFEFF' + output.join('\n') + '\n', 'utf8');
                },

                // 新增的CSV读取函数 - 支持自定义headers
                read: async (csvPath, customHeaders = null) => {
                    const fs = require('fs');
                    const result = [];

                    if (fs.existsSync(csvPath)) {
                        const content = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''); // 读取文件并移除BOM
                        const lines = content.split('\n');

                        if (lines.length > 0) {
                            // 如果提供了自定义headers，使用它们；否则从第一行推断
                            let headers;
                            if (customHeaders) {
                                headers = customHeaders;
                            } else {
                                headers = lines[0].split(',').map(h => h.trim());
                            }

                            // 从适当的位置开始读取数据行
                            let startIndex = 0;
                            if (!customHeaders) {
                                startIndex = 1;
                            } else {
                                // 检查第一行是否为标题行，如果是则跳过
                                const firstLine = lines[0].trim();
                                const expectedHeader = headers.join(',');
                                if (firstLine === expectedHeader) {
                                    startIndex = 1;
                                }
                            }

                            for (let i = startIndex; i < lines.length; i++) {
                                if (lines[i].trim()) {
                                    const values = lines[i].split(',');
                                    const row = {};

                                    headers.forEach((header, index) => {
                                        row[header.trim()] = values[index] ? values[index].trim() : '';
                                    });

                                    result.push(row);
                                }
                            }
                        }
                    }

                    return result;
                }
            }
        };

        $.info('Julong工具库已初始化', 'SETUP');
    }

    return proxies;
}