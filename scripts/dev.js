const path = require('node:path');

const { createLogger, isVerbose, startTimer } = require('../src/generator/utils/logger');
const { runBuildPipeline } = require('./lib/build-pipeline');
const { resolveServerOptionsFromEnv, startServer } = require('./serve-dist');

const log = createLogger('dev');
let serverRef = null;
let shuttingDown = false;

function closeServer(server, exitCode) {
  if (!server) {
    process.exit(exitCode);
    return;
  }

  try {
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
  } catch {
    // ignore
  }

  const forceTimer = setTimeout(() => process.exit(exitCode), 2000);
  if (typeof forceTimer.unref === 'function') forceTimer.unref();

  server.close(() => {
    clearTimeout(forceTimer);
    process.exit(exitCode);
  });
}

async function main() {
  const elapsedMs = startTimer();
  log.info('开始', { version: process.env.npm_package_version });

  const repoRoot = path.resolve(__dirname, '..');

  if (!runBuildPipeline({ log, repoRoot, sync: true })) {
    process.exitCode = 1;
    return;
  }

  const serverOptions = resolveServerOptionsFromEnv();
  const { server, port: actualPort } = await startServer({
    rootDir: path.join(repoRoot, 'dist'),
    host: serverOptions.host,
    port: serverOptions.port,
    strictPort: serverOptions.strictPort,
  });
  serverRef = server;

  log.ok('就绪', { ms: elapsedMs(), url: `http://localhost:${actualPort}` });

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    process.stdout.write('\n');
    log.info('正在关闭...', { signal });

    process.once('SIGINT', () => process.exit(130));

    const exit = signal === 'SIGINT' ? 130 : 0;
    closeServer(serverRef, exit);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((error) => {
    log.error('启动失败', { message: error && error.message ? error.message : String(error) });
    if (isVerbose() && error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}
