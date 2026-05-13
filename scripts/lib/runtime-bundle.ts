import fs from 'node:fs';
import path from 'node:path';

type RuntimeLogger = {
  error: (message: string, meta?: Record<string, unknown>) => void;
  ok: (message: string, meta?: Record<string, unknown>) => void;
};

type RuntimeBundleOptions = {
  repoRoot: string;
  log?: RuntimeLogger;
  startTimer?: () => () => number;
};

type RuntimeBundlePaths = {
  entry: string;
  outFile: string;
};

type BuildResultLike = {
  metafile?: {
    outputs?: Record<string, { bytes?: number }>;
  };
  errors?: unknown[];
};

type EsbuildLike = {
  build: (options: Record<string, unknown>) => Promise<BuildResultLike>;
  context: (options: Record<string, unknown>) => Promise<{
    watch: () => Promise<void>;
  }>;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function loadEsbuild(): EsbuildLike {
  try {
    return require('esbuild');
  } catch {
    throw new Error('未找到 esbuild，请先执行 npm install。');
  }
}

function getRuntimeBundlePaths(repoRoot: string): RuntimeBundlePaths {
  return {
    entry: path.join(repoRoot, 'src', 'runtime', 'index.ts'),
    outFile: path.join(repoRoot, 'public', 'script.js'),
  };
}

function getRuntimeBuildOptions(repoRoot: string): Record<string, unknown> {
  const { entry, outFile } = getRuntimeBundlePaths(repoRoot);

  if (!fs.existsSync(entry)) {
    throw new Error(`运行时入口不存在：${path.relative(repoRoot, entry)}`);
  }

  ensureDir(path.dirname(outFile));

  return {
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2018'],
    sourcemap: false,
    minify: true,
    legalComments: 'none',
    metafile: true,
    logLevel: 'silent',
  };
}

function getOutputBytes(result: BuildResultLike): number {
  const outputs =
    result && result.metafile && result.metafile.outputs ? result.metafile.outputs : null;
  const outKey = outputs
    ? Object.keys(outputs).find((key) => key.endsWith('public/script.js'))
    : '';
  return outKey && outputs && outputs[outKey] ? outputs[outKey].bytes || 0 : 0;
}

function createDeferred<T>(): Deferred<T> {
  const deferred = {} as Deferred<T>;
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
}

async function buildRuntimeBundle(options: RuntimeBundleOptions): Promise<BuildResultLike> {
  const { repoRoot, log, startTimer } = options;
  const esbuild = loadEsbuild();
  const elapsedMs = typeof startTimer === 'function' ? startTimer() : null;
  const result = await esbuild.build(getRuntimeBuildOptions(repoRoot));
  const meta: Record<string, unknown> = {};

  if (elapsedMs) meta.ms = elapsedMs();
  const bytes = getOutputBytes(result);
  if (bytes) meta.bytes = bytes;
  if (log) log.ok('输出 public/script.js', meta);

  return result;
}

async function watchRuntimeBundle(options: RuntimeBundleOptions): Promise<unknown> {
  const { repoRoot, log } = options;
  const esbuild = loadEsbuild();
  let startedAt = Date.now();
  let firstBuild = true;
  const initialBuild = createDeferred<void>();

  const context = await esbuild.context({
    ...getRuntimeBuildOptions(repoRoot),
    plugins: [
      {
        name: 'menav-runtime-watch-log',
        setup(build: {
          onStart: (callback: () => void) => void;
          onEnd: (callback: (result: BuildResultLike) => void) => void;
        }) {
          build.onStart(() => {
            startedAt = Date.now();
          });
          build.onEnd((result) => {
            if (result.errors && result.errors.length > 0) {
              const error = new Error(`runtime bundle 失败：${result.errors.length} 个错误`);
              if (log) log.error('runtime bundle 失败', { errors: result.errors.length });
              if (firstBuild) initialBuild.reject(error);
              return;
            }

            const bytes = getOutputBytes(result);
            const meta: Record<string, unknown> = { ms: Date.now() - startedAt };
            if (bytes) meta.bytes = bytes;
            if (log) log.ok(firstBuild ? 'runtime 初始输出' : 'runtime 已重新输出', meta);
            if (firstBuild) initialBuild.resolve();
            firstBuild = false;
          });
        },
      },
    ],
  });

  await context.watch();
  await initialBuild.promise;
  return context;
}

export { buildRuntimeBundle, getRuntimeBuildOptions, getRuntimeBundlePaths, watchRuntimeBundle };
