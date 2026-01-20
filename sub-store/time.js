const { performance } = require('perf_hooks');

// 1. 原生方案
const getNativeTime = () => {
    return new Date().toISOString().replace('T', ' ').replace('Z', '');
};

// 2. 手动拼接（无缓存）
const getFormatTime = () => {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const h = now.getHours();
    const min = now.getMinutes();
    const s = now.getSeconds();
    const ms = now.getMilliseconds();
    return `${now.getFullYear()}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d} ` +
           `${h < 10 ? '0' + h : h}:${min < 10 ? '0' + min : min}:${s < 10 ? '0' + s : s}.` +
           `${ms < 100 ? (ms < 10 ? '00' + ms : '0' + ms) : ms}`;
};

// 3. 闭包缓存方案 (极致优化)
const getCachedTime = (() => {
    let lastSecond = 0;
    let cachedPrefix = '';
    return () => {
        const now = Date.now();
        const second = (now / 1000) | 0;
        const ms = now % 1000;

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

// --- 测试逻辑 ---

const runTest = (name, fn, iterations = 1000000) => {
    // 预热 (V8 优化关键)
    for (let i = 0; i < 1000; i++) fn();

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
        fn();
    }
    const end = performance.now();
    
    const duration = end - start;
    const opsPerSec = Math.floor((iterations / duration) * 1000);
    console.log(`${name.padEnd(20)}: ${duration.toFixed(2)}ms | ${opsPerSec.toLocaleString()} ops/sec`);
};

console.log(`开始性能测试 (迭代次数: 1,000,000)... \n`);
runTest('Native (ISO)', getNativeTime);
runTest('Manual (No Cache)', getFormatTime);
runTest('Closure (Cached)', getCachedTime);