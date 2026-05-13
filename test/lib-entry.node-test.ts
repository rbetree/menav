const test = require('node:test');
const assert = require('node:assert/strict');

const lib = require('..');

test('Phase 6：包主入口应从 src/lib/index.ts 暴露构建期能力', () => {
  assert.equal(typeof lib.loadConfig, 'function');
  assert.equal(typeof lib.preparePageData, 'function');
  assert.equal(typeof lib.prepareSiteRenderData, 'function');
  assert.equal(typeof lib.renderMarkdownToHtml, 'function');
  assert.equal(typeof lib.buildSearchIndex, 'function');
  assert.equal(lib.MENAV_SEARCH_INDEX_FILE, 'search-index.json');
});
