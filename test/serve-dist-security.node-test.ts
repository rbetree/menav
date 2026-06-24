const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { startServer } = require('../scripts/serve-dist.ts');

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function request(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
        method: 'GET',
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );

    req.once('error', reject);
    req.end();
  });
}

function makeDistFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-dist-sec-'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>MeNav</title>', 'utf8');
  fs.writeFileSync(path.join(root, 'assets', 'style.css'), 'body{}', 'utf8');
  return root;
}

test('serve-dist：只允许安全 URL 路径段访问 dist 内文件', async () => {
  const rootDir = makeDistFixture();
  const { server, port } = await startServer({
    rootDir,
    host: '127.0.0.1',
    port: 0,
    strictPort: true,
  });

  try {
    const ok = await request(port, '/assets/style.css');
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.body, 'body{}');

    const traversal = await request(port, '/%2e%2e/package.json');
    assert.equal(traversal.statusCode, 403);

    const encodedSlash = await request(port, '/assets%2fstyle.css');
    assert.equal(encodedSlash.statusCode, 403);

    const malformed = await request(port, '/%zz');
    assert.equal(malformed.statusCode, 400);
  } finally {
    await close(server);
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
