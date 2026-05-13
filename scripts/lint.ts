const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
const { execFileSync, spawnSync } = require('node:child_process') as typeof import('node:child_process');

const { createLogger } = require('../src/lib/logging/logger.ts');
const { resolveAstroCli } = require('./lib/astro-cli.ts');
const { ensureSupportedNodeVersion } = require('./lib/node-version.ts');

const log = createLogger('lint');

function collectJsFiles(rootDir: string): string[] {
  const files: string[] = [];

  const walk = (currentDir: string): void => {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.forEach((entry: import('node:fs').Dirent) => {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') return;
        walk(fullPath);
        return;
      }

      if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    });
  };

  walk(rootDir);
  return files;
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');

  if (!ensureSupportedNodeVersion({ repoRoot: projectRoot, log, command: 'npm run lint' })) {
    process.exitCode = 1;
    return;
  }

  const targetDirs = ['src', 'scripts', 'test'].map((dir) => path.join(projectRoot, dir));

  const jsFiles = targetDirs.flatMap((dir) => collectJsFiles(dir)).sort();

  if (jsFiles.length === 0) {
    log.ok('未发现需要检查的 .js 文件，跳过');
    return;
  }

  let hasError = false;
  jsFiles.forEach((filePath) => {
    const relativePath = path.relative(projectRoot, filePath);
    try {
      execFileSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
    } catch (error) {
      hasError = true;
      log.error('语法检查失败', {
        file: relativePath,
        exit: error && typeof error === 'object' && 'status' in error ? error.status : 1,
      });
    }
  });

  const astroCli = resolveAstroCli(projectRoot);
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const astroResult = spawnSync(process.execPath, ['-r', registerScript, astroCli, 'check'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  const astroExit = Number.isFinite(astroResult.status) ? Number(astroResult.status) : 1;
  if (astroExit !== 0) {
    hasError = true;
    log.error('Astro 检查失败', { exit: astroExit });
  }

  if (hasError) {
    log.error('语法检查未通过', { files: jsFiles.length });
    process.exitCode = 1;
  } else {
    log.ok('语法检查通过', { files: jsFiles.length, astro: true });
  }
}

main();
