const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PREPARE_WATCH_DIRS } = require('../scripts/dev-astro');

test('dev:astro 监听数据准备模块所在目录', () => {
  for (const expected of [
    path.join('src', 'lib', 'cache'),
    path.join('src', 'lib', 'site-model'),
    path.join('src', 'lib', 'security'),
    path.join('src', 'lib', 'github'),
    path.join('src', 'shared'),
  ]) {
    assert.ok(PREPARE_WATCH_DIRS.includes(expected), `${expected} 应被 dev:astro 监听`);
  }
});
