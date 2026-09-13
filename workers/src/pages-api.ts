import type { Env } from './types';
import { ApiError } from './errors';

export interface Deployment {
  id: string;
  url: string;
  environment: string;
  is_skipped?: boolean;
  deployment_trigger?: { metadata?: { commit_message?: string } };
  latest_stage: { name: string; status: string };
}

export class PagesApiError extends ApiError {
  constructor(
    public definitive: boolean,
    detail: string
  ) {
    super(502, detail, 'pages_api_error');
  }
}

/** API 地址固定，凭证只在 Worker 内使用，不进入快照或构建日志。 */
export async function pagesApi<T>(env: Env, suffix = '', body?: FormData): Promise<T> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID)}/pages/projects/${encodeURIComponent(env.CF_PAGES_PROJECT)}`;
  let response: Response;
  try {
    response = await fetch(base + suffix, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
      body,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new PagesApiError(false, 'Pages API 暂时无法连接，发布状态将在下次检查时恢复');
  }
  let json: { success?: boolean; result?: T };
  try {
    json = await response.json();
  } catch {
    throw new PagesApiError(false, 'Pages API 返回无效响应');
  }
  if (!response.ok || json.success !== true || !json.result) {
    throw new PagesApiError(
      response.status >= 400 && response.status < 500,
      `Pages API 请求失败（HTTP ${response.status}）`
    );
  }
  return json.result;
}
