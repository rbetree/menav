const fs = require('node:fs') as typeof import('node:fs');
const http = require('node:http') as typeof import('node:http');
const path = require('node:path') as typeof import('node:path');

const { createLogger, isVerbose } = require('../src/lib/logging/logger.ts');

const log = createLogger('serve');

type ServerOptions = {
  rootDir: string;
  host: string;
  port: number;
  strictPort?: boolean;
  maxPortAttempts?: number;
};

type StartedServer = {
  server: import('node:http').Server;
  port: number;
  host: string;
};

type ParsedArgs = {
  port: number | null;
  host: string | null;
  root: string | null;
};

type NodeError = Error & { code?: string };

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

function parseInteger(value: unknown, fallback: number): number;
function parseInteger(value: unknown, fallback: null): number | null;
function parseInteger(value: unknown, fallback: number | null): number | null {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function resolveServerOptionsFromEnv(defaultPort = 5173): {
  host: string;
  port: number;
  strictPort: boolean;
} {
  const rawPort = process.env.PORT || process.env.MENAV_PORT || '';

  return {
    host: process.env.HOST || '0.0.0.0',
    port: parseInteger(rawPort || defaultPort, defaultPort),
    strictPort: rawPort !== '',
  };
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = Array.isArray(argv) ? argv.slice() : [];

  const getValue = (keys: string[]): string | null => {
    const idx = args.findIndex((a) => keys.includes(a));
    if (idx === -1) return null;
    const next = args[idx + 1];
    return next ? String(next) : null;
  };

  const portArg = getValue(['--port', '-p']);
  const hostArg = getValue(['--host', '-h']);
  const rootArg = getValue(['--root']);

  return {
    port: portArg ? parseInteger(portArg, null) : null,
    host: hostArg ? String(hostArg) : null,
    root: rootArg ? String(rootArg) : null,
  };
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.ico') return 'image/x-icon';
  if (ext === '.txt') return 'text/plain; charset=utf-8';
  if (ext === '.xml') return 'application/xml; charset=utf-8';
  if (ext === '.map') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function sendNotFound(res: import('node:http').ServerResponse, rootDir: string): void {
  const fallback404 = path.join(rootDir, '404.html');
  if (fs.existsSync(fallback404)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(fallback404).pipe(res);
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Not Found');
}

function sendFile(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  filePath: string,
  rootDir: string
): void {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return sendNotFound(res, rootDir);

    res.statusCode = 200;
    res.setHeader('Content-Type', getContentType(filePath));
    res.setHeader('Content-Length', String(stat.size));

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    log.warn('读取文件失败', {
      path: filePath,
      message: getErrorMessage(error),
    });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    sendNotFound(res, rootDir);
  }
}

function buildHandler(
  rootDir: string
): (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void {
  const normalizedRoot = path.resolve(rootDir);

  return (req, res) => {
    const rawUrl = req.url || '/';
    const rawPath = rawUrl.split('?')[0] || '/';

    let decodedPath = '/';
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Bad Request');
      return;
    }

    const safePath = decodedPath.replace(/\\/g, '/');
    const resolved = path.resolve(normalizedRoot, `.${safePath}`);
    if (!resolved.startsWith(`${normalizedRoot}${path.sep}`) && resolved !== normalizedRoot) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Forbidden');
      return;
    }

    let target = resolved;
    try {
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, 'index.html');
      }
    } catch {
      // ignore
    }

    if (!fs.existsSync(target)) {
      sendNotFound(res, normalizedRoot);
      return;
    }

    sendFile(req, res, target, normalizedRoot);
  };
}

function listenServer(
  server: import('node:http').Server,
  port: number,
  host: string
): Promise<StartedServer> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };

    const onListening = () => {
      server.off('error', onError);
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' ? addr.port : port;
      resolve({ server, port: actualPort, host });
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

function isAddressInUse(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as NodeError).code === 'EADDRINUSE');
}

async function startServer(options: ServerOptions): Promise<StartedServer> {
  const { rootDir, host, port, strictPort = true, maxPortAttempts = strictPort ? 1 : 20 } = options;
  const normalizedRoot = path.resolve(rootDir);

  if (!fs.existsSync(normalizedRoot)) {
    throw new Error(`dist 目录不存在：${normalizedRoot}`);
  }

  const handler = buildHandler(normalizedRoot);
  const attempts = Math.max(1, parseInteger(maxPortAttempts, 1));
  const initialPort = parseInteger(port, 5173);

  for (let offset = 0; offset < attempts; offset += 1) {
    const candidatePort = initialPort + offset;
    const server = http.createServer(handler);

    try {
      return await listenServer(server, candidatePort, host);
    } catch (error) {
      if (!strictPort && isAddressInUse(error) && offset < attempts - 1) {
        log.warn('端口已占用，尝试下一个端口', {
          port: candidatePort,
          next: candidatePort + 1,
        });
        continue;
      }

      throw error;
    }
  }

  throw new Error(`无法启动静态服务：端口 ${initialPort}-${initialPort + attempts - 1} 均不可用`);
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const defaultRoot = path.join(repoRoot, 'dist');
  const args = parseArgs(process.argv.slice(2));
  const envOptions = resolveServerOptionsFromEnv();

  const port = args.port ?? envOptions.port;
  const host = args.host || envOptions.host;
  const strictPort = args.port !== null || envOptions.strictPort;
  const rootDir = args.root ? path.resolve(repoRoot, args.root) : defaultRoot;

  log.info('启动静态服务', {
    root: path.relative(repoRoot, rootDir) || '.',
    host,
    port,
    autoPort: !strictPort,
  });

  const { server, port: actualPort } = await startServer({ rootDir, host, port, strictPort });

  log.ok('就绪', { url: `http://localhost:${actualPort}` });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    process.stdout.write('\n');
    log.info('正在关闭...', { signal });

    try {
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    } catch {
      // ignore
    }

    const exit = signal === 'SIGINT' ? 130 : 0;
    const forceTimer = setTimeout(() => process.exit(exit), 2000);
    if (typeof forceTimer.unref === 'function') forceTimer.unref();

    server.close(() => {
      clearTimeout(forceTimer);
      process.exit(exit);
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch((error) => {
    log.error('启动失败', { message: getErrorMessage(error) });
    const stack = getErrorStack(error);
    if (isVerbose() && stack) console.error(stack);
    process.exitCode = 1;
  });
}

module.exports = {
  resolveServerOptionsFromEnv,
  startServer,
};
