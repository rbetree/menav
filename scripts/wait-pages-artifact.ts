import { setTimeout as sleep } from 'node:timers/promises';

import { createLogger } from '../src/lib/logging/logger.ts';

const log = createLogger('pages-artifact');
const maxAttempts = 24;
const intervalMs = 5000;

interface PagesArtifact {
  id: number;
  name: string;
  expired: boolean;
}

export async function waitForPagesArtifact(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  delay: (milliseconds: number) => Promise<unknown> = sleep
): Promise<PagesArtifact> {
  for (const name of [
    'GITHUB_REPOSITORY',
    'GITHUB_RUN_ID',
    'PAGES_ARTIFACT_ID',
    'GITHUB_TOKEN',
  ] as const) {
    if (!env[name]) throw new Error(`${name} is required`);
  }

  const apiUrl = env.GITHUB_API_URL || 'https://api.github.com';
  const artifactUrl = `${apiUrl}/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/artifacts?per_page=100`;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchImpl(artifactUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Artifact metadata request failed: HTTP ${response.status}`);

    const metadata = (await response.json()) as { artifacts?: PagesArtifact[] };
    if (!metadata || !Array.isArray(metadata.artifacts)) {
      throw new Error('Invalid artifact metadata response');
    }

    const artifact = metadata.artifacts.find(
      (entry) =>
        String(entry.id) === env.PAGES_ARTIFACT_ID &&
        entry.name === 'github-pages' &&
        entry.expired === false
    );
    if (artifact) {
      log.ok('Pages artifact metadata is visible', { id: artifact.id, attempt });
      return artifact;
    }

    log.info('Waiting for Pages artifact metadata', { attempt, maxAttempts });
    if (attempt < maxAttempts) await delay(intervalMs);
  }

  throw new Error(`Pages artifact did not become visible after ${maxAttempts} attempts`);
}

if (require.main === module) {
  waitForPagesArtifact().catch((error) => {
    log.error('Pages artifact readiness check failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  });
}
