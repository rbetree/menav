const test = require('node:test');
const assert = require('node:assert/strict');

const { getSettings } = require('../scripts/sync-heatmap');

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }

  try {
    run();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('HEATMAP_CACHE_DIR 不再影响 heatmap 缓存目录', () => {
  withEnv({ HEATMAP_CACHE_DIR: '/tmp/heatmap-only', PROJECTS_CACHE_DIR: undefined }, () => {
    assert.equal(getSettings({}).cacheDir, 'dev');
  });
});

test('heatmap 缓存目录统一跟随 PROJECTS_CACHE_DIR', () => {
  withEnv(
    { HEATMAP_CACHE_DIR: '/tmp/heatmap-only', PROJECTS_CACHE_DIR: '/tmp/projects-cache' },
    () => {
      assert.equal(getSettings({}).cacheDir, '/tmp/projects-cache');
    }
  );
});
