const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const { createLogger } = require('../src/lib/logging/logger.ts');
const { resolveAstroCli } = require('./lib/astro-cli');

const log = createLogger('lint');

function collectJsFiles(rootDir) {
  const files = [];

  const walk = (currentDir) => {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.forEach((entry) => {
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
      log.error('语法检查失败', { file: relativePath, exit: error && error.status });
    }
  });

  const astroCli = resolveAstroCli(projectRoot);
  const astroResult = spawnSync(process.execPath, [astroCli, 'check'], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  const astroExit = astroResult && Number.isFinite(astroResult.status) ? astroResult.status : 1;
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
