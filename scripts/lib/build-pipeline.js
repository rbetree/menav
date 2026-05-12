const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runNode(scriptPath) {
  const registerScript = path.join(__dirname, '..', 'register-ts.cjs');
  const result = spawnSync(process.execPath, ['-r', registerScript, scriptPath], { stdio: 'inherit' });
  return result && Number.isFinite(result.status) ? result.status : 1;
}

function runStep(log, label, scriptPath) {
  const exit = runNode(scriptPath);
  if (exit !== 0) {
    log.error(`${label} 失败`, { exit });
    return false;
  }

  return true;
}

function runBestEffortStep(log, label, scriptPath) {
  const exit = runNode(scriptPath);
  if (exit !== 0) {
    log.warn(`${label} 异常退出，已继续（best-effort）`, { exit });
  }
}

function runBuildPipeline(options) {
  const { log, repoRoot, sync = true } = options;

  if (!runStep(log, 'clean', path.join(repoRoot, 'scripts', 'clean.js'))) {
    return false;
  }

  if (sync) {
    runBestEffortStep(log, 'sync-projects', path.join(repoRoot, 'scripts', 'sync-projects.js'));
    runBestEffortStep(log, 'sync-heatmap', path.join(repoRoot, 'scripts', 'sync-heatmap.js'));
    runBestEffortStep(log, 'sync-articles', path.join(repoRoot, 'scripts', 'sync-articles.js'));
  }

  if (
    !runStep(log, 'prepare astro public', path.join(repoRoot, 'scripts', 'prepare-astro-public.js'))
  ) {
    return false;
  }

  if (!runStep(log, 'runtime bundle', path.join(repoRoot, 'scripts', 'build-runtime.js'))) {
    return false;
  }

  if (!runStep(log, 'astro build', path.join(repoRoot, 'scripts', 'run-astro-build.js'))) {
    return false;
  }

  return true;
}

module.exports = {
  runBuildPipeline,
};
