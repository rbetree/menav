import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { ensureSupportedNodeVersion } from './node-version.ts';

type PipelineLogger = {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

type BuildPipelineOptions = {
  log: PipelineLogger;
  repoRoot: string;
  sync?: boolean;
  command?: string;
};

function runNode(scriptPath: string): number {
  const registerScript = path.join(__dirname, '..', 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, scriptPath], {
    stdio: 'inherit',
    env: process.env,
  });
  return Number.isFinite(result.status) ? Number(result.status) : 1;
}

function runConfigPreflight(log: PipelineLogger, repoRoot: string): boolean {
  const registerScript = path.join(__dirname, '..', 'register-ts.cjs');
  const result = spawnSync(
    process.execPath,
    [
      '-r',
      registerScript,
      '-e',
      "try { require('./src/lib/config/index.ts').loadConfig() } catch (error) { require('./src/lib/errors.ts').handleError(error) }",
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    }
  );

  const exit = Number.isFinite(result.status) ? Number(result.status) : 1;
  if (exit !== 0) {
    log.error('config preflight 失败', { exit });
    return false;
  }

  return true;
}

function runStep(log: PipelineLogger, label: string, scriptPath: string): boolean {
  const exit = runNode(scriptPath);
  if (exit !== 0) {
    log.error(`${label} 失败`, { exit });
    return false;
  }

  return true;
}

function runBestEffortStep(log: PipelineLogger, label: string, scriptPath: string): void {
  const exit = runNode(scriptPath);
  if (exit !== 0) {
    log.warn(`${label} 异常退出，已继续（best-effort）`, { exit });
  }
}

function runBuildPipeline(options: BuildPipelineOptions): boolean {
  const {
    log,
    repoRoot,
    sync = true,
    command = sync ? 'npm run dev' : 'npm run dev:offline',
  } = options;

  if (!ensureSupportedNodeVersion({ repoRoot, log, command })) {
    return false;
  }

  if (!runConfigPreflight(log, repoRoot)) {
    return false;
  }

  const previousConfigDiagnostics = process.env.MENAV_CONFIG_DIAGNOSTICS;
  process.env.MENAV_CONFIG_DIAGNOSTICS = 'silent';

  const restoreConfigDiagnostics = (): void => {
    if (previousConfigDiagnostics === undefined) {
      delete process.env.MENAV_CONFIG_DIAGNOSTICS;
      return;
    }
    process.env.MENAV_CONFIG_DIAGNOSTICS = previousConfigDiagnostics;
  };

  try {
    if (!runStep(log, 'clean', path.join(repoRoot, 'scripts', 'clean.ts'))) {
      return false;
    }

    if (sync) {
      runBestEffortStep(log, 'sync-projects', path.join(repoRoot, 'scripts', 'sync-projects.ts'));
      runBestEffortStep(log, 'sync-heatmap', path.join(repoRoot, 'scripts', 'sync-heatmap.ts'));
      runBestEffortStep(log, 'sync-articles', path.join(repoRoot, 'scripts', 'sync-articles.ts'));
    }

    if (
      !runStep(
        log,
        'prepare astro public',
        path.join(repoRoot, 'scripts', 'prepare-astro-public.ts')
      )
    ) {
      return false;
    }

    if (!runStep(log, 'runtime bundle', path.join(repoRoot, 'scripts', 'build-runtime.ts'))) {
      return false;
    }

    if (!runStep(log, 'astro build', path.join(repoRoot, 'scripts', 'run-astro-build.ts'))) {
      return false;
    }

    return true;
  } finally {
    restoreConfigDiagnostics();
  }
}

export { runBuildPipeline };
