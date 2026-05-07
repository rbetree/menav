const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/** @param {string} pageId */
function resolvePageConfigFilePath(pageId) {
  if (!pageId) return null;

  const candidates = [
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', 'user', 'pages', `${pageId}.yaml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yml`),
    path.join(process.cwd(), 'config', '_default', 'pages', `${pageId}.yaml`),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) return filePath;
    } catch {
      // 忽略 IO 异常，继续尝试下一个候选
    }
  }

  return null;
}

/** @param {string | null} filePath */
function tryGetGitLastCommitIso(filePath) {
  if (!filePath) return null;

  try {
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    const output = execFileSync('git', ['log', '-1', '--format=%cI', '--', relativePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const raw = String(output || '').trim();
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString();
  } catch {
    return null;
  }
}

/** @param {string | null} filePath */
function tryGetFileMtimeIso(filePath) {
  if (!filePath) return null;

  try {
    const stats = fs.statSync(filePath);
    const mtime = stats && stats.mtime ? stats.mtime : null;
    if (!(mtime instanceof Date) || Number.isNaN(mtime.getTime())) return null;
    return mtime.toISOString();
  } catch {
    return null;
  }
}

/** @param {string} pageId */
function getPageConfigUpdatedAtMeta(pageId) {
  const filePath = resolvePageConfigFilePath(pageId);
  if (!filePath) return null;

  const gitIso = tryGetGitLastCommitIso(filePath);
  if (gitIso) {
    return { updatedAt: gitIso, updatedAtSource: 'git' };
  }

  const mtimeIso = tryGetFileMtimeIso(filePath);
  if (mtimeIso) {
    return { updatedAt: mtimeIso, updatedAtSource: 'mtime' };
  }

  return null;
}

module.exports = {
  getPageConfigUpdatedAtMeta,
  resolvePageConfigFilePath,
  tryGetFileMtimeIso,
  tryGetGitLastCommitIso,
};
