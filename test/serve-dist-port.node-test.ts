const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { startServer } = require('../scripts/serve-dist.ts');

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function closeIfOpen(server) {
  if (server.listening) {
    await close(server);
  }
}

async function findConsecutivePorts() {
  for (let base = 20000; base < 45000; base += 1) {
    const first = http.createServer((req, res) => res.end('busy'));
    const second = http.createServer((req, res) => res.end('probe'));

    try {
      await listen(first, base);
      await listen(second, base + 1);
      return { first, second, base };
    } catch {
      await closeIfOpen(first);
      await closeIfOpen(second);
    }
  }

  throw new Error('未找到可用的连续测试端口');
}

function makeDistFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-dist-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>MeNav</title>');
  return root;
}

test('serve-dist：默认端口占用时应自动顺延', async () => {
  const rootDir = makeDistFixture();
  const { first: blocker, second, base: blockedPort } = await findConsecutivePorts();
  await close(second);

  const { server, port } = await startServer({
    rootDir,
    host: '127.0.0.1',
    port: blockedPort,
    strictPort: false,
    maxPortAttempts: 2,
  });

  try {
    assert.equal(port, blockedPort + 1);
  } finally {
    await close(server);
    await close(blocker);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('serve-dist：显式端口占用时应保持严格失败', async () => {
  const rootDir = makeDistFixture();
  const blocker = http.createServer((req, res) => res.end('busy'));
  await listen(blocker, 0);

  const blockedPort = blocker.address().port;

  try {
    await assert.rejects(
      () =>
        startServer({
          rootDir,
          host: '127.0.0.1',
          port: blockedPort,
          strictPort: true,
        }),
      /EADDRINUSE/
    );
  } finally {
    await close(blocker);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
