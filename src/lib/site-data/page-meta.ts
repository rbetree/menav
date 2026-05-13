import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function resolvePageConfigFilePath(pageId: string): string | null {
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

function tryGetGitLastCommitIso(filePath: string | null): string | null {
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

function tryGetFileMtimeIso(filePath: string | null): string | null {
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

function getPageConfigUpdatedAtMeta(
  pageId: string
): { updatedAt: string; updatedAtSource: 'git' | 'mtime' } | null {
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

export {
  getPageConfigUpdatedAtMeta,
  resolvePageConfigFilePath,
  tryGetFileMtimeIso,
  tryGetGitLastCommitIso,
};
