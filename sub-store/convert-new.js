/**
 * Sub-Store 订阅转换脚本 (New GEOSITE format)
 * 参考 merge-template.yml 风格
 * 
 * 支持的传入参数：
 * - loadbalance: 启用负载均衡（url-test/load-balance，默认 false）
 * - landing: 启用落地节点功能（默认 false）
 * - ipv6: 启用 IPv6 支持（默认 false）
 * - full: 输出完整配置（默认 false）
 * - keepalive: 启用 tcp-keep-alive（默认 false）
 * - fakeip: DNS 使用 FakeIP 模式（默认 false）
 * - quic: 允许 QUIC 流量（默认 false）
 * - threshold: 国家节点数量小于该值时不显示分组 (默认 0)
 */

const NODE_SUFFIX = "节点";

function parseBool(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    return false;
}

function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === 'undefined') {
        return defaultValue;
    }
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

function buildFeatureFlags(args) {
    const spec = {
        loadbalance: "loadBalance",
        landing: "landing",
        ipv6: "ipv6Enabled",
        full: "fullConfig",
        keepalive: "keepAliveEnabled",
        fakeip: "fakeIPEnabled",
        quic: "quicEnabled"
    };

    const flags = Object.entries(spec).reduce((acc, [sourceKey, targetKey]) => {
        acc[targetKey] = parseBool(args[sourceKey]) || false;
        return acc;
    }, {});

    flags.countryThreshold = parseNumber(args.threshold, 0);
    return flags;
}

const rawArgs = typeof $arguments !== 'undefined' ? $arguments : {};
const {
    loadBalance,
    landing,
    ipv6Enabled,
    fullConfig,
    keepAliveEnabled,
    fakeIPEnabled,
    quicEnabled,
    countryThreshold
} = buildFeatureFlags(rawArgs);

// 地区元数据
const countriesMeta = {
    "香港": { pattern: "香港|港|HK|hk|Hong Kong|HongKong|hongkong|🇭🇰", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Hong_Kong.png" },
    "澳门": { pattern: "澳门|MO|Macau|🇲🇴", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Macao.png" },
    "台湾": { pattern: "台|新北|彰化|TW|Taiwan|🇹🇼", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Taiwan.png" },
    "新加坡": { pattern: "新加坡|坡|狮城|SG|Singapore|🇸🇬", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Singapore.png" },
    "日本": { pattern: "日本|川日|东京|大阪|泉日|埼玉|沪日|深日|JP|Japan|🇯🇵", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Japan.png" },
    "韩国": { pattern: "KR|Korea|KOR|首尔|韩|韓|🇰🇷", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Korea.png" },
    "美国": { pattern: "美国|美|US|United States|🇺🇸", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_States.png" },
    "加拿大": { pattern: "加拿大|Canada|CA|🇨🇦", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Canada.png" },
    "英国": { pattern: "英国|United Kingdom|UK|伦敦|London|🇬🇧", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/United_Kingdom.png" },
    "澳大利亚": { pattern: "澳洲|澳大利亚|AU|Australia|🇦🇺", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Australia.png" },
    "德国": { pattern: "德国|德|DE|Germany|🇩🇪", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Germany.png" },
    "法国": { pattern: "法国|法|FR|France|🇫🇷", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/France.png" },
    "俄罗斯": { pattern: "俄罗斯|俄|RU|Russia|🇷🇺", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Russia.png" },
    "泰国": { pattern: "泰国|泰|TH|Thailand|🇹🇭", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Thailand.png" },
    "印度": { pattern: "印度|IN|India|🇮🇳", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/India.png" },
    "马来西亚": { pattern: "马来西亚|马来|MY|Malaysia|🇲🇾", icon: "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Malaysia.png" },
};

function getCountryGroupNames(countryInfo, minCount) {
    return countryInfo
        .filter(item => item.count >= minCount)
        .map(item => item.country + NODE_SUFFIX);
}

function stripNodeSuffix(groupNames) {
    const suffixPattern = new RegExp(`${NODE_SUFFIX}$`);
    return groupNames.map(name => name.replace(suffixPattern, ""));
}

function parseCountries(config) {
    const proxies = config.proxies || [];
    const ispRegex = /家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地/i;
    const countryCounts = Object.create(null);
    const compiledRegex = {};
    for (const [country, meta] of Object.entries(countriesMeta)) {
        compiledRegex[country] = new RegExp(meta.pattern.replace(/^\(\?i\)/, ''));
    }

    for (const proxy of proxies) {
        const name = proxy.name || '';
        if (ispRegex.test(name)) continue;
        for (const [country, regex] of Object.entries(compiledRegex)) {
            if (regex.test(name)) {
                countryCounts[country] = (countryCounts[country] || 0) + 1;
                break;
            }
        }
    }

    const result = [];
    for (const [country, count] of Object.entries(countryCounts)) {
        result.push({ country, count });
    }
    return result;
}

function hasLowCost(config) {
    const lowCostRegex = /0\.[0-5]|低倍率|省流|大流量|实验性/i;
    return (config.proxies || []).some(proxy => lowCostRegex.test(proxy.name));
}

// 代理组名称常量 (匹配 merge-template.yml)
const PROXY_GROUPS = {
    SELECT: "🚀 代理",
    MANUAL: "🪬 手动切换",
    AUTO: "♻️ 自动选择",
    ADBLOCK: "🛑 广告拦截",
    DIRECT: "🎯 全球直连",
    LANDING: "落地节点", // 脚本特有功能
    LOW_COST: "低倍率节点", // 脚本特有功能
    TIMESTAMP: "UpdateTimestamp",
    MY_RULES: "🔧 我的规则",
    MANUAL_SELECT: "🌟 手工精选"
};

// 规则集 (匹配 merge-template.yml)
const baseRules = [
    // 1. 最高优先级：局域网和特殊地址直连
    `GEOSITE,private,${PROXY_GROUPS.DIRECT}`,
    `GEOIP,private,${PROXY_GROUPS.DIRECT},no-resolve`,

    // 3. 广告拦截
    `GEOSITE,category-ads-all,${PROXY_GROUPS.ADBLOCK}`,

    // 4. 必须直连的特定服务
    `GEOSITE,microsoft@cn,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,apple-cn,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,steam@cn,${PROXY_GROUPS.DIRECT}`,
    `GEOSITE,bilibili,${PROXY_GROUPS.DIRECT}`,

    // 5. 必须走代理的特定服务
    `GEOSITE,google,${PROXY_GROUPS.SELECT}`,
    `GEOSITE,youtube,${PROXY_GROUPS.SELECT}`,
    `GEOSITE,telegram,${PROXY_GROUPS.SELECT}`,
    `GEOIP,telegram,${PROXY_GROUPS.SELECT}`,
    `GEOSITE,netflix,${PROXY_GROUPS.SELECT}`,
    `GEOSITE,openai,${PROXY_GROUPS.SELECT}`,

    // 6. 被墙网站列表
    `GEOSITE,gfw,${PROXY_GROUPS.SELECT}`,

    // 7. 国内域名和IP地址直连
    `GEOSITE,cn,${PROXY_GROUPS.DIRECT}`,
    `GEOIP,CN,${PROXY_GROUPS.DIRECT}`,

    // 8. 最终规则：所有其他流量直连 (黑名单模式)
    `MATCH,${PROXY_GROUPS.DIRECT}`
];

function buildRules({ quicEnabled }) {
    const ruleList = [...baseRules];
    if (!quicEnabled) {
        // 屏蔽 QUIC 流量
        ruleList.unshift("AND,((DST-PORT,443),(NETWORK,UDP)),REJECT");
    }
    return ruleList;
}

const snifferConfig = {
    "enable": true,
    "parse-pure-ip": true,
    "sniff": {
        "TLS": { "ports": [443, 8443] },
        "HTTP": { "ports": [80, 8080, 8880], "priority-domain-vendors": ["google", "youtube"] },
        "QUIC": { "ports": [443] }
    }
};

function buildDnsConfig({ mode, fakeIpFilter }) {
    const config = {
        "enable": true,
        "ipv6": ipv6Enabled,
        "listen": "0.0.0.0:1053",
        "enhanced-mode": mode,
        "fake-ip-range": "198.18.0.1/16",
        "default-nameserver": [
            "223.5.5.5",
            "119.29.29.29",
            "1.12.12.12"
        ],
        "proxy-server-nameserver": [
            "https://dns.alidns.com/dns-query",
            "https://doh.pub/dns-query"
        ],
        "nameserver": [
            "https://dns.alidns.com/dns-query",
            "https://doh.pub/dns-query"
        ],
        "fallback": [],
        "nameserver-policy": {
            "geosite:cn,private,apple,steam": [
                "https://dns.alidns.com/dns-query",
                "https://doh.pub/dns-query"
            ]
        }
    };

    if (fakeIpFilter) {
        config["fake-ip-filter"] = fakeIpFilter;
    }

    return config;
}

const dnsConfig = buildDnsConfig({ mode: "redir-host" });
const dnsConfigFakeIp = buildDnsConfig({
    mode: "fake-ip",
    // 简单的 fake-ip-filter，Mihomo 通常有内置的默认值
    fakeIpFilter: [
        "+.lan",
        "+.local",
        "geosite:private",
        "geosite:cn"
    ]
});

// 辅助函数：构建数组并过滤无效值
const buildList = (...elements) => elements.flat().filter(Boolean);

function buildCountryProxyGroups({ countries, landing, loadBalance }) {
    const groups = [];
    const baseExcludeFilter = "0\\.[0-5]|低倍率|省流|大流量|实验性";
    const landingExcludeFilter = "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地";
    const groupType = loadBalance ? "load-balance" : "url-test";

    for (const country of countries) {
        const meta = countriesMeta[country];
        if (!meta) continue;

        const groupConfig = {
            "name": `${country}${NODE_SUFFIX}`,
            "icon": meta.icon,
            "include-all": true,
            "filter": meta.pattern,
            "exclude-filter": landing ? `${landingExcludeFilter}|${baseExcludeFilter}` : baseExcludeFilter,
            "type": groupType
        };

        if (!loadBalance) {
            Object.assign(groupConfig, {
                "url": "http://www.gstatic.com/generate_204",
                "interval": 300,
                "tolerance": 100,
                "lazy": false
            });
        }
        groups.push(groupConfig);
    }
    return groups;
}

function buildProxyGroups({
    landing,
    countries,
    countryProxyGroups,
    lowCost,
    countryGroupNames
}) {
    // 1. UpdateTimestamp
    const timestampGroup = {
        "name": PROXY_GROUPS.TIMESTAMP,
        "type": "select",
        "include-all": true,
        "filter": "(?i)Timestamp"
    };

    // 2. My Rules
    const myRulesGroup = {
        "name": PROXY_GROUPS.MY_RULES,
        "type": "select",
        "include-all": true,
        "filter": "(?i)🌟|新加坡|坡|狮城|SG|Singapore|美|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|US|United States|韩国|韩|KR|France|法国|Paris|Netherlands"
    };

    // 3. Manual Select (Handpicked)
    const manualSelectGroup = {
        "name": PROXY_GROUPS.MANUAL_SELECT,
        "type": "select",
        "include-all": true,
        "filter": "(?i)🌟"
    };

    // 4. 自动选择 (Auto)
    const autoGroup = {
        "name": PROXY_GROUPS.AUTO,
        "type": "url-test",
        "include-all": true,
        "url": "http://www.gstatic.com/generate_204",
        "interval": 300,
        "tolerance": 100
    };

    // 5. 手动切换 (Manual)
    const manualGroup = {
        "name": PROXY_GROUPS.MANUAL,
        "type": "select",
        "include-all": true
    };

    // 6. 落地节点 (Landing) - 可选
    let landingGroup = null;
    if (landing) {
        landingGroup = {
            "name": PROXY_GROUPS.LANDING,
            "icon": "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Airport.png",
            "type": "select",
            "include-all": true,
            "filter": "(?i)家宽|家庭|家庭宽带|商宽|商业宽带|星链|Starlink|落地",
        };
    }

    // 7. 低倍率节点 (Low Cost) - 可选
    let lowCostGroup = null;
    if (lowCost) {
        lowCostGroup = {
            "name": PROXY_GROUPS.LOW_COST,
            "icon": "https://raw.githubusercontent.com/Koolson/Qure/master/IconSet/Color/Lab.png",
            "type": "url-test",
            "url": "http://www.gstatic.com/generate_204",
            "include-all": true,
            "filter": "(?i)0\.[0-5]|低倍率|省流|大流量|实验性"
        };
    }

    // 8. 主代理组 (Select)
    // 包含：手动精选, 我的规则, 手动切换, 自动选择, 各国节点组, 落地/低倍率(如果有), 直连
    const selectProxies = buildList(
        PROXY_GROUPS.MANUAL_SELECT,
        PROXY_GROUPS.MY_RULES,
        PROXY_GROUPS.MANUAL,
        PROXY_GROUPS.AUTO,
        landing && PROXY_GROUPS.LANDING,
        lowCost && PROXY_GROUPS.LOW_COST,
        countryGroupNames,
        "DIRECT"
    );

    const selectGroup = {
        "name": PROXY_GROUPS.SELECT,
        "type": "select",
        "proxies": selectProxies
    };

    // 9. 广告拦截 (AdBlock)
    const adBlockGroup = {
        "name": PROXY_GROUPS.ADBLOCK,
        "type": "select",
        "proxies": ["REJECT"]
    };

    // 10. 全球直连 (Direct)
    const directGroup = {
        "name": PROXY_GROUPS.DIRECT,
        "type": "select",
        "proxies": ["DIRECT"]
    };

    // 组装所有组
    return buildList(
        selectGroup,
        timestampGroup,
        myRulesGroup,
        manualSelectGroup,
        manualGroup,
        autoGroup,
        landingGroup,
        lowCostGroup,
        adBlockGroup,
        directGroup,
        countryProxyGroups
    );
}

function main(config) {
    const resultConfig = { proxies: config.proxies };

    // 解析地区与低倍率信息
    const countryInfo = parseCountries(resultConfig);
    const lowCost = hasLowCost(resultConfig);
    const countryGroupNames = getCountryGroupNames(countryInfo, countryThreshold);
    const countries = stripNodeSuffix(countryGroupNames);

    // 构建地区分组
    const countryProxyGroups = buildCountryProxyGroups({ countries, landing, loadBalance });

    // 构建所有代理组
    const proxyGroups = buildProxyGroups({
        landing,
        countries,
        countryProxyGroups,
        lowCost,
        countryGroupNames
    });

    const finalRules = buildRules({ quicEnabled });

    if (fullConfig) {
        Object.assign(resultConfig, {
            "port": 7890,
            "socks-port": 7891,
            "allow-lan": true,
            "mode": "Rule",
            "log-level": "info",
            "external-controller": "127.0.0.1:9090",
            "ipv6": ipv6Enabled,
            "find-process-mode": "off",
            "profile": {
                "store-selected": true,
            }
        });
    }

    Object.assign(resultConfig, {
        "proxy-groups": proxyGroups,
        "rules": finalRules,
        "sniffer": snifferConfig,
        "dns": fakeIPEnabled ? dnsConfigFakeIp : dnsConfig,
    });

    return resultConfig;
}