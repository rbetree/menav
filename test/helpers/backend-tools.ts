const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const silentLogger = { info() {}, warn() {}, error() {}, ok() {} };

function tempRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-backend-'));
  fs.mkdirSync(path.join(root, 'workers'), { recursive: true });
  for (const name of [
    'wrangler.example.jsonc',
    'wrangler.test.example.jsonc',
    'wrangler.local.example.jsonc',
    '.dev.vars.example',
    'pages.env.example',
  ]) {
    fs.writeFileSync(path.join(root, 'workers', name), '{}\n', 'utf8');
  }
  return root;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function validConfig(overrides = {}) {
  return {
    name: 'menav-backend',
    main: 'src/index.ts',
    d1_databases: [
      {
        binding: 'DB',
        database_name: 'menav-db',
        database_id: '11111111-1111-1111-1111-111111111111',
      },
    ],
    vars: {
      TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
      POLICY_AUD: 'aud-production',
      CF_ACCOUNT_ID: 'account-id',
      CF_PAGES_PROJECT: 'menav-web',
    },
    ...overrides,
  };
}

module.exports = { tempRepo, writeJson, validConfig, silentLogger };
