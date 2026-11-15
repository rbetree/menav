const test = require('node:test');
const assert = require('node:assert/strict');

const storagePath = require.resolve('../src/runtime/app/storage.ts');

function loadStorageFresh() {
  delete require.cache[storagePath];
  return require(storagePath);
}

function withWindow(fakeWindow, callback) {
  const originalWindow = globalThis.window;
  globalThis.window = fakeWindow;
  try {
    callback();
  } finally {
    globalThis.window = originalWindow;
  }
}

test('safeStorage：localStorage 读取与写入抛错时降级到内存', () => {
  const throwingWindow = {};
  Object.defineProperty(throwingWindow, 'localStorage', {
    get() {
      throw new Error('storage blocked');
    },
  });

  withWindow(throwingWindow, () => {
    const { safeGetItem, safeSetItem } = loadStorageFresh();
    assert.equal(safeGetItem('theme'), null);
    safeSetItem('theme', 'dark');
    assert.equal(safeGetItem('theme'), 'dark');
  });
});

test('safeStorage：可用时读写原生 localStorage', () => {
  const native = new Map();
  const fakeWindow = {
    localStorage: {
      getItem: (key) => (native.has(key) ? native.get(key) : null),
      setItem: (key, value) => native.set(key, value),
    },
  };

  withWindow(fakeWindow, () => {
    const { safeGetItem, safeSetItem } = loadStorageFresh();
    safeSetItem('searchEngine', 'bing');
    assert.equal(native.get('searchEngine'), 'bing');
    assert.equal(safeGetItem('searchEngine'), 'bing');
  });
});

test('safeStorage：写入失败但读取可用时仍返回本次写入值', () => {
  const fakeWindow = {
    localStorage: {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    },
  };

  withWindow(fakeWindow, () => {
    const { safeGetItem, safeSetItem } = loadStorageFresh();
    safeSetItem('sidebarCollapsed', 'true');
    assert.equal(safeGetItem('sidebarCollapsed'), 'true');
  });
});
