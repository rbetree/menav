import fs from 'node:fs';
import path from 'node:path';

type NodeLibLogger = {
  ok: (message: string, meta?: Record<string, unknown>) => void;
};

type NodeLibBundleOptions = {
  repoRoot: string;
  log?: NodeLibLogger;
  startTimer?: () => () => number;
};

type NodeLibBundlePaths = {
  entry: string;
  outFile: string;
};

type BuildResultLike = {
  metafile?: {
    outputs?: Record<string, { bytes?: number }>;
  };
};

type EsbuildLike = {
  build: (options: Record<string, unknown>) => Promise<BuildResultLike>;
};

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function loadEsbuild(): EsbuildLike {
  try {
    return require('esbuild');
  } catch {
    throw new Error('未找到 esbuild，请先执行 npm install。');
  }
}

function getNodeLibBundlePaths(repoRoot: string): NodeLibBundlePaths {
  return {
    entry: path.join(repoRoot, 'src', 'lib', 'index.ts'),
    outFile: path.join(repoRoot, 'dist-node', 'index.cjs'),
  };
}

function getNodeLibBuildOptions(repoRoot: string): Record<string, unknown> {
  const { entry, outFile } = getNodeLibBundlePaths(repoRoot);

  if (!fs.existsSync(entry)) {
    throw new Error(`库入口不存在：${path.relative(repoRoot, entry)}`);
  }

  ensureDir(path.dirname(outFile));

  return {
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node22'],
    sourcemap: false,
    minify: false,
    legalComments: 'none',
    metafile: true,
    logLevel: 'silent',
  };
}

function getOutputBytes(result: BuildResultLike): number {
  const outputs = result?.metafile?.outputs || null;
  const outKey = outputs ? Object.keys(outputs).find((key) => key.endsWith('dist-node/index.cjs')) : '';
  return outKey && outputs && outputs[outKey] ? outputs[outKey].bytes || 0 : 0;
}

async function buildNodeLibBundle(options: NodeLibBundleOptions): Promise<BuildResultLike> {
  const { repoRoot, log, startTimer } = options;
  const esbuild = loadEsbuild();
  const elapsedMs = typeof startTimer === 'function' ? startTimer() : null;
  const result = await esbuild.build(getNodeLibBuildOptions(repoRoot));
  const meta: Record<string, unknown> = { outFile: 'dist-node/index.cjs' };

  if (elapsedMs) meta.ms = elapsedMs();
  const bytes = getOutputBytes(result);
  if (bytes) meta.bytes = bytes;
  if (log) log.ok('输出 dist-node/index.cjs', meta);

  return result;
}

export { buildNodeLibBundle, getNodeLibBuildOptions, getNodeLibBundlePaths };
