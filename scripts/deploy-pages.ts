import fs from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

import { createLogger } from '../src/lib/logging/logger.ts';

const log = createLogger('pages-deploy');
const maxPolls = 120;
const intervalMs = 5000;
const maxDurationMs = 10 * 60 * 1000;
const failedStatuses = new Set([
  'deployment_failed',
  'deployment_perms_error',
  'deployment_content_failed',
  'deployment_cancelled',
  'deployment_lost',
]);

interface PagesDeployment {
  id?: string | number;
  page_url?: string;
}

export async function deployPages(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  delay: (milliseconds: number, signal?: AbortSignal) => Promise<unknown> = (
    milliseconds,
    signal
  ) => sleep(milliseconds, undefined, { signal }),
  now: () => number = Date.now,
  signal?: AbortSignal
): Promise<PagesDeployment> {
  for (const name of [
    'GITHUB_REPOSITORY',
    'GITHUB_SHA',
    'PAGES_ARTIFACT_ID',
    'GITHUB_TOKEN',
    'ACTIONS_ID_TOKEN_REQUEST_URL',
    'ACTIONS_ID_TOKEN_REQUEST_TOKEN',
  ] as const) {
    if (!env[name]) throw new Error(`${name} is required`);
  }

  const artifactId = Number(env.PAGES_ARTIFACT_ID);
  if (!Number.isSafeInteger(artifactId) || artifactId <= 0) {
    throw new Error('PAGES_ARTIFACT_ID must be a positive safe integer');
  }

  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  const deploymentUrl = `${apiUrl}/repos/${env.GITHUB_REPOSITORY}/pages/deployments`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  async function request(url: string, options: RequestInit, label: string, interruptible = true) {
    const timeout = AbortSignal.timeout(10000);
    const requestSignal = signal && interruptible ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await fetchImpl(url, { ...options, signal: requestSignal });
    if (!response.ok) throw new Error(`${label} failed: HTTP ${response.status}`);
    if (response.status === 204) return {};
    return response.json();
  }

  const identity = (await request(
    env.ACTIONS_ID_TOKEN_REQUEST_URL!,
    { headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } },
    'OIDC token request'
  )) as { value?: string };
  if (!identity || typeof identity.value !== 'string' || !identity.value) {
    throw new Error('OIDC token response is missing value');
  }

  const deployment = (await request(
    deploymentUrl,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        artifact_id: artifactId,
        pages_build_version: env.GITHUB_SHA,
        oidc_token: identity.value,
      }),
    },
    'Pages deployment creation'
  )) as PagesDeployment;
  const deploymentId = deployment.id || env.GITHUB_SHA!;
  const statusUrl = `${deploymentUrl}/${encodeURIComponent(deploymentId)}`;
  const startedAt = now();
  let pending = true;
  let previousStatus = '';
  log.info('Created Pages deployment', { artifactId, deploymentId });

  try {
    for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
      signal?.throwIfAborted();
      if (now() - startedAt >= maxDurationMs) {
        throw new Error('Pages deployment exceeded the 10 minute total deadline');
      }
      await delay(intervalMs, signal);
      signal?.throwIfAborted();
      if (now() - startedAt >= maxDurationMs) {
        throw new Error('Pages deployment exceeded the 10 minute total deadline');
      }
      const result = (await request(statusUrl, { headers }, 'Pages deployment status')) as {
        status?: string;
      };
      if (!result || typeof result.status !== 'string') {
        throw new Error('Invalid Pages deployment status response');
      }
      if (result.status === 'succeed') {
        pending = false;
        log.ok('Pages deployment succeeded', { deploymentId });
        return deployment;
      }
      if (failedStatuses.has(result.status)) {
        pending = false;
        throw new Error(`Pages deployment failed: ${result.status}`);
      }
      if (result.status !== previousStatus) {
        log.info('Waiting for Pages deployment', { status: result.status });
        previousStatus = result.status;
      }
    }
    throw new Error(`Pages deployment timed out after ${maxPolls} status checks`);
  } catch (error) {
    if (pending) {
      try {
        await request(
          `${statusUrl}/cancel`,
          { method: 'POST', headers },
          'Pages cancellation',
          false
        );
      } catch {
        log.warn('Unable to cancel the pending Pages deployment');
      }
    }
    throw error;
  }
}

if (require.main === module) {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Pages deployment interrupted'));
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  deployPages(process.env, fetch, undefined, Date.now, controller.signal)
    .then((deployment) => {
      if (deployment.page_url && process.env.GITHUB_OUTPUT) {
        const pageUrl = new URL(deployment.page_url).href;
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `page_url=${pageUrl}\n`);
      }
    })
    .catch((error) => {
      log.error('Pages deployment failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    })
    .finally(() => {
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
    });
}
