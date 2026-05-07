const path = require('node:path');
const fs = require('node:fs');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');

const log = createLogger('bundle');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function main() {
  let esbuild;
  try {
    esbuild = require('esbuild');
  } catch (error) {
    log.error('未找到 esbuild，请先执行 npm install。');
    process.exitCode = 1;
    return;
  }

  const projectRoot = path.resolve(__dirname, '..');
  const entry = path.join(projectRoot, 'src', 'runtime', 'index.ts');
  const outFile = path.join(projectRoot, 'public', 'script.js');

  if (!fs.existsSync(entry)) {
    log.error('运行时入口不存在', { path: path.relative(projectRoot, entry) });
    process.exitCode = 1;
    return;
  }

  ensureDir(path.dirname(outFile));

  try {
    const elapsedMs = startTimer();
    const result = await esbuild.build({
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
    });

    const ms = elapsedMs();
    const outputs =
      result && result.metafile && result.metafile.outputs ? result.metafile.outputs : null;
    const outKey = outputs ? Object.keys(outputs).find((k) => k.endsWith('public/script.js')) : '';
    const bytes = outKey && outputs && outputs[outKey] ? outputs[outKey].bytes : 0;

    const meta = { ms };
    if (bytes) meta.bytes = bytes;
    log.ok('输出 public/script.js', meta);
  } catch (error) {
    log.error('构建 public/script.js 失败', {
      message: error && error.message ? error.message : String(error),
    });
    if (isVerbose() && error && error.stack) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  }
}

main();
