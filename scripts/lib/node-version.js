const fs = require('node:fs');
const path = require('node:path');

function parseVersion(version) {
  const match = String(version || '')
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function readRequiredNodeVersion(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const enginesNode = packageJson && packageJson.engines && packageJson.engines.node;
  const match = String(enginesNode || '').match(/>=\s*(\d+(?:\.\d+){0,2})/);

  if (!match) {
    throw new Error('无法从 package.json 解析 engines.node');
  }

  const normalized = match[1].split('.');
  while (normalized.length < 3) normalized.push('0');

  const version = normalized.join('.');
  const parsed = parseVersion(version);
  if (!parsed) {
    throw new Error(`无法解析 Node.js 版本要求: ${enginesNode}`);
  }

  return {
    raw: enginesNode,
    normalized: version,
    parsed,
  };
}

function ensureSupportedNodeVersion(options) {
  const { repoRoot, log, command = 'npm run dev' } = options;
  const currentVersion = parseVersion(process.versions.node);
  const required = readRequiredNodeVersion(repoRoot);

  if (!currentVersion) {
    throw new Error(`无法解析当前 Node.js 版本: ${process.versions.node}`);
  }

  if (compareVersions(currentVersion, required.parsed) >= 0) {
    return true;
  }

  log.error('Node.js 版本不受支持', {
    current: process.versions.node,
    required: required.raw,
    suggestion: `请先运行 nvm use，再执行 ${command}`,
  });
  return false;
}

module.exports = {
  ensureSupportedNodeVersion,
};
