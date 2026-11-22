const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  parseGitStatus,
  resolveWranglerBin,
  restoreWranglerWorkspace,
  runPagesCreate,
} = require('../scripts/pages-create.ts');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test('pages:create 解析 git 状态并区分跟踪文件与未跟踪产物', () => {
  const status = parseGitStatus(
    ' M astro.config.mjs\0?? wrangler.jsonc\0?? public/index.html\0?? notes.txt\0'
  );
  assert.deepEqual(status.tracked, ['astro.config.mjs']);
  assert.deepEqual(status.untracked, ['wrangler.jsonc', 'public/index.html', 'notes.txt']);
});

test('pages:create 还原跟踪文件且只删除 wrangler 产物', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-pages-create-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(root, 'astro.config.mjs'), 'export default {}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n', 'utf8');
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);

  fs.writeFileSync(path.join(root, 'astro.config.mjs'), 'changed\n', 'utf8');
  fs.writeFileSync(path.join(root, 'wrangler.jsonc'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'index.html'), 'generated\n', 'utf8');
  fs.writeFileSync(path.join(root, 'notes.txt'), 'keep\n', 'utf8');

  const restored = restoreWranglerWorkspace(root);
  assert.deepEqual(restored.restored, ['astro.config.mjs']);
  assert.deepEqual(restored.removed.sort(), ['public/index.html', 'wrangler.jsonc']);
  assert.deepEqual(restored.remaining, ['notes.txt']);
  assert.match(
    fs.readFileSync(path.join(root, 'astro.config.mjs'), 'utf8'),
    /^export default \{\}\r?\n$/
  );
  assert.equal(fs.existsSync(path.join(root, 'wrangler.jsonc')), false);
  assert.equal(fs.existsSync(path.join(root, 'public')), false);
  assert.equal(fs.readFileSync(path.join(root, 'notes.txt'), 'utf8'), 'keep\n');
});

function gitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-pages-create-run-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Test']);
  return root;
}

function commitAll(root) {
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'init']);
}

test('pages:create 只删除未跟踪文件，保留 public/ 下已跟踪文件', () => {
  const root = gitRepo();
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'public', 'keep.txt'), 'keep\n', 'utf8');
  commitAll(root);

  fs.writeFileSync(path.join(root, 'public', 'generated.txt'), 'generated\n', 'utf8');
  const restored = restoreWranglerWorkspace(root);
  assert.deepEqual(restored.removed, ['public/generated.txt']);
  assert.deepEqual(restored.remaining, []);
  assert.equal(fs.readFileSync(path.join(root, 'public', 'keep.txt'), 'utf8'), 'keep\n');
  assert.equal(fs.existsSync(path.join(root, 'public', 'generated.txt')), false);
});

test('pages:create 可解析 workers 依赖或 MENAV_WRANGLER_BIN', () => {
  const root = gitRepo();
  assert.equal(resolveWranglerBin(root), undefined);
  const bin = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, '', 'utf8');
  assert.equal(resolveWranglerBin(root), bin);
});

test('pages:create 要求工作区干净', () => {
  const root = gitRepo();
  fs.writeFileSync(path.join(root, 'astro.config.mjs'), 'export default {}\n', 'utf8');
  commitAll(root);
  fs.writeFileSync(path.join(root, 'dirty.txt'), 'dirty\n', 'utf8');
  assert.equal(runPagesCreate({ repoRoot: root, projectName: 'menav-test' }), 1);
});

test('pages:create 缺少 wrangler 时给出安装提示', () => {
  const root = gitRepo();
  fs.writeFileSync(path.join(root, 'astro.config.mjs'), 'export default {}\n', 'utf8');
  commitAll(root);
  assert.equal(runPagesCreate({ repoRoot: root, projectName: 'menav-test' }), 1);
});

test('pages:create 清理 wrangler 新增的 .wrangler 缓存', () => {
  const root = gitRepo();
  fs.writeFileSync(path.join(root, '.gitignore'), '/.wrangler/\n', 'utf8');
  const binDir = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, 'wrangler.js'),
    `const fs = require('node:fs');
fs.mkdirSync('.wrangler', { recursive: true });
fs.writeFileSync('.wrangler/cache.txt', 'cache\\n');
`,
    'utf8'
  );
  commitAll(root);

  assert.equal(runPagesCreate({ repoRoot: root, projectName: 'menav-test' }), 0);
  assert.equal(fs.existsSync(path.join(root, '.wrangler')), false);
});

test('pages:create 在 wrangler 改动仓库后还原并保留已跟踪文件', () => {
  const root = gitRepo();
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  fs.writeFileSync(path.join(root, 'astro.config.mjs'), 'export default {}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'package.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(root, 'public', 'keep.txt'), 'keep\n', 'utf8');
  commitAll(root);

  const binDir = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, 'wrangler.js'),
    `const fs = require('node:fs');
fs.writeFileSync('astro.config.mjs', 'changed\\n');
fs.writeFileSync('package.json', '{"changed":true}\\n');
fs.writeFileSync('wrangler.jsonc', '{}\\n');
fs.writeFileSync('public/generated.txt', 'generated\\n');
process.exit(1);
`,
    'utf8'
  );
  commitAll(root);

  assert.equal(runPagesCreate({ repoRoot: root, projectName: 'menav-test' }), 1);
  assert.match(
    fs.readFileSync(path.join(root, 'astro.config.mjs'), 'utf8'),
    /^export default \{\}/
  );
  assert.equal(fs.readFileSync(path.join(root, 'package.json'), 'utf8').trim(), '{}');
  assert.equal(fs.readFileSync(path.join(root, 'public', 'keep.txt'), 'utf8'), 'keep\n');
  assert.equal(fs.existsSync(path.join(root, 'public', 'generated.txt')), false);
  assert.equal(fs.existsSync(path.join(root, 'wrangler.jsonc')), false);
});
