const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const { createLogger, isVerbose, startTimer } = require('../src/lib/logging/logger.ts');
const { resolveAstroCli } = require('./lib/astro-cli');
const { ensureSupportedNodeVersion } = require('./lib/node-version');
const { watchRuntimeBundle } = require('./lib/runtime-bundle');

const log = createLogger('dev:astro');
const PREPARE_WATCH_DIRS = [
  'config',
  'assets',
  path.join('src', 'lib', 'config'),
  path.join('src', 'lib', 'content'),
  path.join('src', 'lib', 'html'),
  path.join('src', 'lib', 'search-index'),
  path.join('src', 'lib', 'site-data'),
  path.join('src', 'lib', 'view-data'),
];

function hasArg(argv, name) {
  return argv.includes(name) || argv.some((arg) => arg.startsWith(`${name}=`));
}

function resolveAstroDevArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : [];

  if (!hasArg(args, '--port')) {
    args.push('--port', String(process.env.PORT || process.env.MENAV_PORT || 5173));
  }

  if (!hasArg(args, '--host')) {
    args.push('--host', String(process.env.HOST || '0.0.0.0'));
  }

  return args;
}

function runNodeScript(repoRoot, scriptRelativePath) {
  const scriptPath = path.join(repoRoot, scriptRelativePath);
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, scriptPath], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return result && Number.isFinite(result.status) ? result.status : 1;
}

function preparePublic(repoRoot) {
  return runNodeScript(repoRoot, path.join('scripts', 'prepare-astro-public.js')) === 0;
}

function collectDirectories(rootDir) {
  const dirs = [];

  const walk = (currentDir) => {
    if (!fs.existsSync(currentDir)) return;
    dirs.push(currentDir);

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.forEach((entry) => {
      if (entry.isDirectory()) walk(path.join(currentDir, entry.name));
    });
  };

  walk(rootDir);
  return dirs;
}

function createPrepareWatcher(repoRoot, onChange) {
  const watchers = new Map();
  let refreshTimer = null;

  const closeAll = () => {
    watchers.forEach((watcher) => watcher.close());
    watchers.clear();
    if (refreshTimer) clearTimeout(refreshTimer);
  };

  const refresh = () => {
    const nextDirs = new Set(
      PREPARE_WATCH_DIRS.flatMap((relativeDir) =>
        collectDirectories(path.join(repoRoot, relativeDir))
      )
    );

    watchers.forEach((watcher, dirPath) => {
      if (!nextDirs.has(dirPath)) {
        watcher.close();
        watchers.delete(dirPath);
      }
    });

    nextDirs.forEach((dirPath) => {
      if (watchers.has(dirPath)) return;

      try {
        const watcher = fs.watch(dirPath, { persistent: true }, (_eventType, filename) => {
          if (filename && String(filename).startsWith('.')) return;
          onChange(path.relative(repoRoot, path.join(dirPath, filename || '')) || '.');

          if (refreshTimer) clearTimeout(refreshTimer);
          refreshTimer = setTimeout(refresh, 200);
        });
        watchers.set(dirPath, watcher);
      } catch (error) {
        log.warn('监听目录失败，已跳过', {
          path: path.relative(repoRoot, dirPath),
          message: error && error.message ? error.message : String(error),
        });
      }
    });
  };

  refresh();

  return {
    close: closeAll,
    count: () => watchers.size,
  };
}

function createDebouncedPrepare(repoRoot) {
  let timer = null;
  let running = false;
  let pending = false;
  let lastChangedPath = '';

  const run = () => {
    if (running) {
      pending = true;
      return;
    }

    running = true;
    pending = false;

    log.info('重新准备 public 资源', { changed: lastChangedPath });
    const ok = preparePublic(repoRoot);
    if (ok) {
      log.ok('public 资源已更新');
    } else {
      log.error('public 资源更新失败，保留 dev 服务以便修复配置或资源错误');
    }

    running = false;
    if (pending) run();
  };

  return (changedPath) => {
    lastChangedPath = changedPath;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 150);
  };
}

function startAstroDev(repoRoot, argv) {
  const astroCli = resolveAstroCli(repoRoot);
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const args = ['dev', ...resolveAstroDevArgs(argv)];
  return spawn(process.execPath, ['-r', registerScript, astroCli, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

function stopChild(child, signal) {
  if (!child || child.killed) return;
  try {
    child.kill(signal);
  } catch {
    // ignore
  }
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');

  log.info('开始', { version: process.env.npm_package_version });

  if (!ensureSupportedNodeVersion({ repoRoot, log, command: 'npm run dev:astro' })) {
    process.exitCode = 1;
    return;
  }

  if (!preparePublic(repoRoot)) {
    process.exitCode = 1;
    return;
  }

  const runtimeContext = await watchRuntimeBundle({ repoRoot, log });
  const rerunPrepare = createDebouncedPrepare(repoRoot);
  const prepareWatcher = createPrepareWatcher(repoRoot, rerunPrepare);
  const astro = startAstroDev(repoRoot, process.argv.slice(2));
  let shuttingDown = false;

  log.ok('就绪', { ms: elapsedMs(), watchedDirs: prepareWatcher.count() });

  const shutdown = async (signal, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;

    process.stdout.write('\n');
    log.info('正在关闭...', { signal });

    prepareWatcher.close();
    stopChild(astro, signal === 'SIGINT' ? 'SIGINT' : 'SIGTERM');

    try {
      await runtimeContext.dispose();
    } catch {
      // ignore
    }

    process.exit(exitCode);
  };

  astro.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const exitCode = Number.isFinite(code) ? code : signal === 'SIGINT' ? 130 : 1;
    shutdown(signal || 'astro-exit', exitCode);
  });

  process.once('SIGINT', () => shutdown('SIGINT', 130));
  process.once('SIGTERM', () => shutdown('SIGTERM', 0));
}

if (require.main === module) {
  main().catch((error) => {
    log.error('启动失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  PREPARE_WATCH_DIRS,
  createPrepareWatcher,
  preparePublic,
  resolveAstroDevArgs,
  startAstroDev,
};
