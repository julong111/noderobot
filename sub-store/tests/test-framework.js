/**
 * 测试框架 - test-framework.js
 * 提供测试套件和断言工具
 */

class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
    this.beforeEachFn = null;
    this.afterEachFn = null;
    this.results = [];
  }

  beforeEach(fn) {
    this.beforeEachFn = fn;
  }

  afterEach(fn) {
    this.afterEachFn = fn;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`\n=== ${this.name} ===\n`);

    for (let i = 0; i < this.tests.length; i++) {
      const { name, fn } = this.tests[i];
      const testResult = { name, status: 'passed', error: null };

      try {
        if (this.beforeEachFn) {
          await this.beforeEachFn();
        }
        
        await fn();
        
        if (this.afterEachFn) {
          await this.afterEachFn();
        }

        console.log(`[${i + 1}] ✅ ${name}`);
        testResult.status = 'passed';
      } catch (e) {
        testResult.status = 'failed';
        testResult.error = e.message;
        console.error(`[${i + 1}] ❌ ${name}`);
        console.error(`    └─ ${e.message}`);
      }

      this.results.push(testResult);
    }

    this._printSummary();
    return this.results;
  }

  _printSummary() {
    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const total = this.results.length;

    console.log('\n================================');
    console.log(`总计: ${passed} 通过, ${failed} 失败 (共 ${total} 个测试)`);
    console.log('================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  }
}

const assert = {
  equals(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(`${msg || 'Assertion failed'}: expected "${expected}", got "${actual}"`);
    }
  },

  notEquals(actual, expected, msg) {
    if (actual === expected) {
      throw new Error(`${msg || 'Assertion failed'}: should not equal "${expected}"`);
    }
  },

  notEmpty(arr, msg) {
    if (!arr || arr.length === 0) {
      throw new Error(msg || 'Array should not be empty');
    }
  },

  isTrue(value, msg) {
    if (value !== true) {
      throw new Error(`${msg || 'Assertion failed'}: expected true, got "${value}"`);
    }
  },

  isFalse(value, msg) {
    if (value !== false) {
      throw new Error(`${msg || 'Assertion failed'}: expected false, got "${value}"`);
    }
  },

  includes(haystack, needle, msg) {
    if (!haystack || !haystack.includes(needle)) {
      throw new Error(`${msg || 'Assertion failed'}: "${haystack}" does not include "${needle}"`);
    }
  },

  notIncludes(haystack, needle, msg) {
    if (haystack && haystack.includes(needle)) {
      throw new Error(`${msg || 'Assertion failed'}: "${haystack}" should not include "${needle}"`);
    }
  },

  throws(fn, msg) {
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(msg || 'Expected function to throw');
    }
  },

  notThrows(fn, msg) {
    try {
      fn();
    } catch (e) {
      throw new Error(`${msg || 'Expected function not to throw'}: ${e.message}`);
    }
  },

  hasProperty(obj, prop, msg) {
    if (!obj || !(prop in obj)) {
      throw new Error(`${msg || 'Assertion failed'}: object missing property "${prop}"`);
    }
  },

  lengthOf(arr, len, msg) {
    if (!arr || arr.length !== len) {
      throw new Error(`${msg || 'Assertion failed'}: expected length ${len}, got ${arr?.length || 0}`);
    }
  },

  some(arr, predicate, msg) {
    if (!arr || !arr.some(predicate)) {
      throw new Error(msg || 'Array should contain at least one matching element');
    }
  },

  none(arr, predicate, msg) {
    if (arr && arr.some(predicate)) {
      throw new Error(msg || 'Array should not contain any matching elements');
    }
  }
};

const mock = {
  createProxies(count, options = {}) {
    const { prefix = '节点', type = 'vmess' } = options;
    return Array.from({ length: count }, (_, i) => ({
      name: `${prefix}${String.fromCharCode(65 + i)}`,
      server: `10.0.0.${i + 1}`,
      port: 443,
      type
    }));
  },

  createProxy(overrides = {}) {
    return {
      name: '测试节点',
      server: '1.1.1.1',
      port: 443,
      type: 'vmess',
      ...overrides
    };
  }
};

module.exports = { TestSuite, assert, mock };
