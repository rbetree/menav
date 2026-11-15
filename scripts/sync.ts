import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { createLogger, isVerbose, startTimer } from '../src/lib/logging/logger.ts';

const log = createLogger('sync');

type SyncSourceReport = {
  name: string;
  url?: string;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
  fallback?: boolean;
};

type SyncReport = {
  script: string;
  success: number;
  failed: number;
  skipped: number;
  cacheWritten: boolean;
  sources: SyncSourceReport[];
};

type SyncSummary = {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  cacheWritten: boolean;
  allFailed: boolean;
};

function runNode(scriptPath: string, reportPath: string): number {
  const registerScript = path.join(__dirname, 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, scriptPath], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: { ...process.env, MENAV_SYNC_REPORT: reportPath },
  });
  return Number.isFinite(result.status) ? Number(result.status) : 1;
}

function isSyncReport(value: unknown): value is SyncReport {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  return Boolean(record && typeof record.script === 'string' && Array.isArray(record.sources));
}

function parseSyncReportFile(reportPath: string): SyncReport[] {
  try {
    if (!fs.existsSync(reportPath)) return [];
    return fs
      .readFileSync(reportPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .filter(isSyncReport);
  } catch {
    return [];
  }
}

function summarizeSyncReports(reports: SyncReport[]): SyncSummary {
  const sources = reports.flatMap((report) => report.sources);
  const success = sources.filter((source) => source.status === 'success').length;
  const failed = sources.filter((source) => source.status === 'failed').length;
  const skipped = sources.filter((source) => source.status === 'skipped').length;
  const total = sources.length;

  return {
    total,
    success,
    failed,
    skipped,
    cacheWritten: reports.some((report) => report.cacheWritten),
    allFailed: total > 0 && success === 0,
  };
}

function printSyncSummary(reports: SyncReport[], summary: SyncSummary): void {
  for (const report of reports) {
    for (const source of report.sources) {
      const meta = {
        script: report.script,
        source: source.name,
        url: source.url,
        error: source.error,
        fallback: source.fallback,
      };
      if (source.status === 'success') log.ok('来源成功', meta);
      else if (source.status === 'skipped') log.warn('来源跳过', meta);
      else log.warn('来源失败', meta);
    }
  }

  log.info('同步摘要', {
    sources: summary.total,
    success: summary.success,
    failed: summary.failed,
    skipped: summary.skipped,
    cacheWritten: summary.cacheWritten,
  });

  if (summary.allFailed) {
    log.error(
      '全部同步来源失败：本次未更新任何缓存，已保留上一次成功数据；部署将继续，但站点数据可能过期',
      { sources: summary.total, failed: summary.failed, skipped: summary.skipped }
    );
  }
}

async function main() {
  const elapsedMs = startTimer();
  const repoRoot = path.resolve(__dirname, '..');
  log.info('开始', { version: process.env.npm_package_version });

  const steps = [
    ['sync-projects', path.join(repoRoot, 'scripts', 'sync-projects.ts')],
    ['sync-heatmap', path.join(repoRoot, 'scripts', 'sync-heatmap.ts')],
    ['sync-articles', path.join(repoRoot, 'scripts', 'sync-articles.ts')],
  ] as const;

  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-sync-report-'));
  const reportPath = path.join(reportDir, 'report.jsonl');
  const failedSteps: string[] = [];

  try {
    steps.forEach(([label, script]) => {
      const exit = runNode(script, reportPath);
      if (exit !== 0) {
        failedSteps.push(label);
        log.warn(`${label} 异常退出，已继续（best-effort）`, { exit });
      }
    });

    const reports = parseSyncReportFile(reportPath);
    const summary = summarizeSyncReports(reports);
    printSyncSummary(reports, summary);

    if (failedSteps.length > 0) {
      log.error('同步步骤异常退出，结果可能不完整', { steps: failedSteps.join(',') });
    }

    log.ok('完成', { ms: elapsedMs(), cacheWritten: summary.cacheWritten });
  } finally {
    fs.rmSync(reportDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    log.error('执行失败', { message: error instanceof Error ? error.message : String(error) });
    if (isVerbose() && error instanceof Error && error.stack) console.error(error.stack);
    process.exitCode = 1;
  });
}

module.exports = {
  parseSyncReportFile,
  summarizeSyncReports,
  printSyncSummary,
};
