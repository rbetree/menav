const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildPagesDeployArgs, runPagesDeploy } = require('../scripts/pages-deploy.ts');

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-pages-deploy-'));
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<html></html>\n', 'utf8');
  return root;
}

test('pages:deploy 组装 wrangler 参数', () => {
  assert.deepEqual(buildPagesDeployArgs({ projectName: 'menav-test', distDir: 'dist' }), [
    'pages',
    'deploy',
    'dist',
    '--project-name',
    'menav-test',
    '--commit-dirty=true',
  ]);
  assert.deepEqual(
    buildPagesDeployArgs({ projectName: 'menav-test', distDir: 'out', branch: 'preview' }),
    [
      'pages',
      'deploy',
      'out',
      '--project-name',
      'menav-test',
      '--commit-dirty=true',
      '--branch',
      'preview',
    ]
  );
});

test('pages:deploy 缺少构建产物或 wrangler 时失败', () => {
  const root = tempRepo();
  assert.equal(
    runPagesDeploy({ repoRoot: root, projectName: 'menav-test', distDir: 'missing' }),
    1
  );
  assert.equal(runPagesDeploy({ repoRoot: root, projectName: 'menav-test' }), 1);
});

test('pages:deploy 通过本地 wrangler 上传 dist', () => {
  const root = tempRepo();
  const binDir = path.join(root, 'workers', 'node_modules', 'wrangler', 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    path.join(binDir, 'wrangler.js'),
    `const fs = require('node:fs');
fs.writeFileSync(process.env.MENAV_DEPLOY_ARGS, JSON.stringify(process.argv.slice(2)));
`,
    'utf8'
  );
  const output = path.join(root, 'args.json');
  const previous = process.env.MENAV_DEPLOY_ARGS;
  process.env.MENAV_DEPLOY_ARGS = output;
  try {
    assert.equal(runPagesDeploy({ repoRoot: root, projectName: 'menav-test' }), 0);
  } finally {
    if (previous === undefined) delete process.env.MENAV_DEPLOY_ARGS;
    else process.env.MENAV_DEPLOY_ARGS = previous;
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), [
    'pages',
    'deploy',
    'dist',
    '--project-name',
    'menav-test',
    '--commit-dirty=true',
  ]);
});
