import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, startTimer } from '../src/lib/logging/logger.ts';

const log = createLogger('audit:final');
const repoRoot = path.resolve(__dirname, '..');

type PublicConfig = {
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

type SearchIndex = {
  schemaVersion?: unknown;
  items?: unknown[];
};

type PackageJson = {
  scripts?: Record<string, string>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SOURCE_EXTENSIONS = new Set([
  '.astro',
  '.css',
  '.js',
  '.json',
  '.md',
  '.ts',
  '.yml',
  '.yaml',
]);
const CODE_EXTENSIONS = new Set(['.astro', '.js', '.ts']);
const EXPECTED_PUBLIC_CONFIG_KEYS = ['version', 'timestamp', 'icons', 'data'];
const EXPECTED_PUBLIC_CONFIG_DATA_KEYS = ['homePageId', 'pageRegistry', 'pageTemplates', 'site'];
const REQUIRED_DOC_COMMANDS = [
  'npm run dev',
  'npm run dev:offline',
  'npm run dev:astro',
  'npm run build',
  'npm run check',
];
const REQUIRED_SRC_DOC_COMMANDS = [...REQUIRED_DOC_COMMANDS, 'npm run test:browser'];
const REQUIRED_STYLE_LAYERS = [
  './styles/tokens.css',
  './styles/themes.css',
  './styles/base.css',
  './styles/layout.css',
  './styles/components.css',
  './styles/utilities.css',
];
const FORBIDDEN_OLD_PATHS = [
  'src/generator.js',
  'src/helpers',
  'src/lib/render-data.js',
  'src/lib/view-utils.js',
];
const RUNTIME_FORBIDDEN_DEPENDENCIES = [
  'src/components/',
  'src/layouts/',
  'src/pages/',
  'src/lib/',
  'scripts/',
];
const ASTRO_FORBIDDEN_DEPENDENCIES = ['src/runtime/'];

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson<T = unknown>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function walk(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'public')
        return [];
      return walk(fullPath);
    }
    if (!entry.isFile()) return [];
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) return [];
    return [normalizePath(path.relative(repoRoot, fullPath))];
  });
}

function collectFiles(...roots: string[]): string[] {
  return roots.flatMap((root) => walk(path.join(repoRoot, root))).sort();
}

function fail(message: string, detail = ''): never {
  const suffix = detail ? `：${detail}` : '';
  throw new Error(`${message}${suffix}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(message, `expected ${expectedJson}, got ${actualJson}`);
  }
}

function assertIncludes(text: string, token: string, message: string): void {
  if (!text.includes(token)) fail(message, token);
}

function ensureBuildArtifacts() {
  const required = [
    'dist/index.html',
    'dist/script.js',
    'dist/menav-config.json',
    'dist/search-index.json',
  ];
  const missing = required.filter((file) => !exists(file));
  if (missing.length === 0) return;

  log.info('缺少构建产物，先执行 build', { missing: missing.join(',') });
  const registerScript = path.join(repoRoot, 'scripts', 'register-ts.cjs');
  const result = spawnSync(
    process.execPath,
    ['-r', registerScript, path.join(repoRoot, 'scripts', 'build.ts')],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  );
  const exitCode = result && Number.isFinite(result.status) ? result.status : 1;
  if (exitCode !== 0) fail('自动构建失败', `exit=${exitCode}`);
}

function auditLegacyBoundaries() {
  const existingOldPaths = FORBIDDEN_OLD_PATHS.filter((file) => exists(file));
  if (existingOldPaths.length > 0) fail('旧兼容路径未清零', existingOldPaths.join(', '));

  const files = collectFiles('src', 'scripts', 'test').filter(
    (file) =>
      file !== 'test/modernization-phase12.node-test.ts' && file !== 'scripts/audit-final.ts'
  );
  const forbiddenTokens = [
    'src/generator',
    '../generator',
    './generator',
    'generator.js',
    'src/helpers',
    'helpers/',
    'render-data.js',
    'view-utils.js',
    'src/lib/render-data',
    'src/lib/view-utils',
  ];
  const hits = files.flatMap((file) => {
    const content = read(file);
    return forbiddenTokens
      .filter((token) => content.includes(token))
      .map((token) => `${file} -> ${token}`);
  });
  if (hits.length > 0) fail('业务代码仍引用旧兼容路径', hits.join('; '));
}

function extractSpecifiers(content: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /import\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g,
    /export\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(content))) {
      specifiers.push(match[1]);
    }
  });
  return specifiers;
}

function resolveLocalDependency(fromFile: string, specifier: string): string {
  if (!specifier.startsWith('.')) return '';

  const fromDir = path.dirname(path.join(repoRoot, fromFile));
  const base = path.resolve(fromDir, specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    `${base}.astro`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.js'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) return normalizePath(path.relative(repoRoot, base));
  return normalizePath(path.relative(repoRoot, found));
}

function auditDependencyDirection() {
  const files = collectFiles('src').filter((file) => CODE_EXTENSIONS.has(path.extname(file)));
  const hits: string[] = [];

  files.forEach((file) => {
    const content = read(file);
    const deps = extractSpecifiers(content)
      .map((specifier) => resolveLocalDependency(file, specifier))
      .filter(Boolean);

    deps.forEach((dependency) => {
      if (
        file.startsWith('src/runtime/') &&
        RUNTIME_FORBIDDEN_DEPENDENCIES.some((prefix) => dependency.startsWith(prefix))
      ) {
        hits.push(`${file} -> ${dependency}`);
      }
      if (
        (file.startsWith('src/components/') ||
          file.startsWith('src/layouts/') ||
          file.startsWith('src/pages/')) &&
        ASTRO_FORBIDDEN_DEPENDENCIES.some((prefix) => dependency.startsWith(prefix))
      ) {
        hits.push(`${file} -> ${dependency}`);
      }
    });
  });

  if (hits.length > 0) fail('源码依赖方向越界', hits.join('; '));
}

function auditPublicArtifacts() {
  ensureBuildArtifacts();

  const runtimeBundle = read('dist/script.js');
  if (runtimeBundle.includes('module.exports')) fail('浏览器 bundle 不应包含裸 module.exports');
  if (runtimeBundle.includes('sourceMappingURL'))
    fail('生产 runtime bundle 不应包含 sourcemap 引用');
  const runtimeBytes = Buffer.byteLength(runtimeBundle);
  if (runtimeBytes > 55000) fail('runtime bundle 超出 Phase 14 预算', `${runtimeBytes} bytes`);

  const publicConfig = readJson<PublicConfig>('dist/menav-config.json');
  assertDeepEqual(
    Object.keys(publicConfig),
    EXPECTED_PUBLIC_CONFIG_KEYS,
    '公开配置顶层字段不符合运行时摘要边界'
  );
  assertDeepEqual(
    Object.keys(publicConfig.data || {}),
    EXPECTED_PUBLIC_CONFIG_DATA_KEYS,
    '公开配置 data 字段不符合运行时摘要边界'
  );
  const serializedConfig = JSON.stringify(publicConfig);
  ['navigation', 'pages', 'social', 'categories', 'sites'].forEach((token) => {
    if (Object.prototype.hasOwnProperty.call(publicConfig.data, token)) {
      fail('公开配置泄漏完整站点数据', token);
    }
    if (serializedConfig.includes('Browser Contract Site')) {
      fail('公开配置包含测试运行时数据');
    }
  });

  const searchIndex = readJson<SearchIndex>('dist/search-index.json');
  if (searchIndex.schemaVersion !== 1)
    fail('搜索索引 schemaVersion 异常', String(searchIndex.schemaVersion));
  if (!Array.isArray(searchIndex.items) || searchIndex.items.length === 0)
    fail('搜索索引 items 为空');
  const invalidSearchItem = searchIndex.items.find((item) => {
    if (!item || typeof item !== 'object') return true;
    const record = item as Record<string, unknown>;
    return !record.type || !record.pageId || !record.title;
  });
  if (invalidSearchItem) fail('搜索索引存在缺失基础字段的条目', JSON.stringify(invalidSearchItem));
}

function auditStyleLayers() {
  const styleEntry = read('assets/style.css');
  REQUIRED_STYLE_LAYERS.forEach((layer) =>
    assertIncludes(styleEntry, `@import '${layer}';`, '样式入口缺少分层导入')
  );

  const orderedPositions = REQUIRED_STYLE_LAYERS.map((layer) =>
    styleEntry.indexOf(`@import '${layer}';`)
  );
  const sortedPositions = [...orderedPositions].sort((left, right) => left - right);
  assertDeepEqual(
    orderedPositions,
    sortedPositions,
    '样式分层导入顺序不符合 token/theme/base/layout/components/utilities'
  );

  const tokenContent = read('assets/styles/tokens.css');
  ['--spacing-', '--radius-', '--transition-', '--accent-'].forEach((token) => {
    assertIncludes(tokenContent, token, 'token 文件缺少基础 token 族');
  });

  const themeContent = read('assets/styles/themes.css');
  assertIncludes(themeContent, '--surface-', '主题文件缺少 surface 语义 token 族');
  const forbiddenSelectors = ['.site-card', '.nav-item', '.search-box', '.content'];
  const themeBody = themeContent.replace(/\/\*[\s\S]*?\*\//g, '');
  const leakedSelectors = forbiddenSelectors.filter((selector) => themeBody.includes(selector));
  if (leakedSelectors.length > 0) fail('主题文件不应包含组件选择器', leakedSelectors.join(', '));
}

function auditDocs() {
  const readme = read('README.md');
  const srcReadme = read('src/README.md');
  const configReadme = read('config/README.md');
  const packageJson = readJson<PackageJson>('package.json');

  REQUIRED_DOC_COMMANDS.forEach((command) =>
    assertIncludes(readme, command, 'README 缺少核心命令说明')
  );
  REQUIRED_SRC_DOC_COMMANDS.forEach((command) =>
    assertIncludes(srcReadme, command, 'src/README 缺少源码工作流命令说明')
  );
  assertIncludes(srcReadme, 'scripts/test-browser.ts', 'src/README 缺少浏览器契约脚本说明');
  assertIncludes(configReadme, 'npm run check', 'config/README 缺少配置验证入口');
  assertIncludes(configReadme, 'npm run dev', 'config/README 缺少配置预览入口');

  const requiredScripts = [
    'build',
    'check',
    'dev',
    'dev:offline',
    'dev:astro',
    'generate',
    'lint',
    'test',
    'test:browser',
  ];
  const missingScripts = requiredScripts.filter(
    (name) => !packageJson.scripts || !packageJson.scripts[name]
  );
  if (missingScripts.length > 0) fail('package.json 缺少必需脚本', missingScripts.join(', '));
}

function main() {
  const elapsedMs = startTimer();
  auditLegacyBoundaries();
  auditDependencyDirection();
  auditPublicArtifacts();
  auditStyleLayers();
  auditDocs();
  log.ok('完成', { ms: elapsedMs() });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    log.error('失败', { message: getErrorMessage(error) });
    process.exitCode = 1;
  }
}

module.exports = {
  auditDependencyDirection,
  auditDocs,
  auditLegacyBoundaries,
  auditPublicArtifacts,
  auditStyleLayers,
};
