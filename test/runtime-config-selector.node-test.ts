const test = require('node:test');
const assert = require('node:assert/strict');

const runtimeConfigPath = require.resolve('../src/runtime/runtime-config.ts');

function loadRuntimeConfig() {
  delete require.cache[runtimeConfigPath];
  return require(runtimeConfigPath);
}

function createFakeDocument(nodes) {
  function matchesScript(node) {
    return (
      node.tagName === 'SCRIPT' &&
      node.id === 'menav-runtime-config' &&
      node.type === 'application/json'
    );
  }

  return {
    getElementById(id) {
      return nodes.find((node) => node.id === id) || null;
    },
    querySelector(selector) {
      if (selector !== 'script#menav-runtime-config[type="application/json"]') return null;
      return nodes.find(matchesScript) || null;
    },
  };
}

test('runtime-config：只读取 script#menav-runtime-config[type="application/json"]', () => {
  const originalDocument = globalThis.document;
  try {
    globalThis.document = createFakeDocument([
      {
        tagName: 'DIV',
        id: 'menav-runtime-config',
        textContent: JSON.stringify({ version: 'fake-div' }),
      },
    ]);

    const { getRuntimeConfig } = loadRuntimeConfig();
    assert.equal(getRuntimeConfig(), null, '伪造的 div#menav-runtime-config 不应提供配置');

    globalThis.document = createFakeDocument([
      {
        tagName: 'SCRIPT',
        id: 'menav-runtime-config',
        type: 'application/json',
        textContent: JSON.stringify({ version: '1.2.3', data: { homePageId: 'home' } }),
      },
    ]);
    const realConfig = getRuntimeConfig();
    assert.equal(realConfig?.version, '1.2.3');
    assert.equal(realConfig?.data?.homePageId, 'home');
  } finally {
    globalThis.document = originalDocument;
  }
});
