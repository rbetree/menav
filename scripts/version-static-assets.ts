import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';

const log = createLogger('version-assets');

const HASH_LENGTH = 10;
const SEARCH_INDEX_REFERENCE = './search-index.json';

type StaticAssetVersions = {
  searchIndex: string;
  runtime: string;
  style: string;
  pinyin: string;
};

type VersionedContent = {
  content: string;
  replaced: number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function hashFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, HASH_LENGTH);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function versionReference(content: string, reference: string, version: string): VersionedContent {
  // 同时匹配已版本化引用，重复执行时只替换查询串，避免叠加成 ?v=a?v=b
  const pattern = new RegExp(`${escapeRegExp(reference)}(?:\\?v=[0-9a-f]{${HASH_LENGTH}})?`, 'g');
  const matches = content.match(pattern);
  if (!matches) return { content, replaced: 0 };

  return {
    content: content.replace(pattern, `${reference}?v=${version}`),
    replaced: matches.length,
  };
}

function assertFileExists(filePath: string, distDir: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`缺少待版本化的构建产物：${path.relative(distDir, filePath)}`);
  }
}

function versionStaticAssets(distDir: string): StaticAssetVersions {
  const searchIndexPath = path.join(distDir, 'search-index.json');
  const runtimePath = path.join(distDir, 'script.js');
  const stylePath = path.join(distDir, 'assets', 'style.css');
  const pinyinPath = path.join(distDir, 'pinyin-match.js');

  [searchIndexPath, runtimePath, stylePath, pinyinPath].forEach((filePath) =>
    assertFileExists(filePath, distDir)
  );

  const searchIndex = hashFile(searchIndexPath);
  const runtimeSource = fs.readFileSync(runtimePath, 'utf8');
  const versionedRuntime = versionReference(runtimeSource, SEARCH_INDEX_REFERENCE, searchIndex);
  if (versionedRuntime.replaced === 0) {
    throw new Error('dist/script.js 中未找到搜索索引引用 ./search-index.json，无法版本化');
  }
  fs.writeFileSync(runtimePath, versionedRuntime.content);

  // script.js 注入索引版本后内容已变化，runtime hash 必须在写入后重新计算
  const runtime = hashFile(runtimePath);
  const style = hashFile(stylePath);
  const pinyin = hashFile(pinyinPath);

  const htmlFiles = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => path.join(distDir, entry.name));
  if (htmlFiles.length === 0) throw new Error('dist 中未找到可版本化的 HTML 文件');

  const htmlAssetVersions: Array<[string, string]> = [
    ['./assets/style.css', style],
    ['./pinyin-match.js', pinyin],
    ['./script.js', runtime],
  ];

  let replacedReferences = 0;
  htmlFiles.forEach((htmlPath) => {
    let html = fs.readFileSync(htmlPath, 'utf8');
    let fileReplacements = 0;

    htmlAssetVersions.forEach(([reference, version]) => {
      const result = versionReference(html, reference, version);
      html = result.content;
      fileReplacements += result.replaced;
    });

    if (fileReplacements === 0) return;
    fs.writeFileSync(htmlPath, html);
    replacedReferences += fileReplacements;
  });

  if (replacedReferences === 0) {
    throw new Error('dist HTML 中未找到需要版本化的静态资源引用');
  }

  return { searchIndex, runtime, style, pinyin };
}

function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');
  const versions = versionStaticAssets(path.join(repoRoot, 'dist'));

  log.ok('完成', { ms: elapsedMs(), ...versions });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    log.error('失败', { message: getErrorMessage(error) });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    process.exitCode = 1;
  }
}

module.exports = {
  hashFile,
  versionStaticAssets,
};
