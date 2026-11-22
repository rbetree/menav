import fs from 'node:fs';
import path from 'node:path';

export function resolveWranglerBin(repoRoot: string): string | undefined {
  const candidates = [
    process.env.MENAV_WRANGLER_BIN,
    path.join(repoRoot, 'workers', 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
    path.join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js'),
  ].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function isValidPagesProjectName(name: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name.trim());
}
