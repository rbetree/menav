import fs from 'node:fs';
import path from 'node:path';

import { createLogger } from '../logging/logger.ts';

type InitResult = {
  initialized: boolean;
  source: 'existing' | '_default' | 'empty';
};

const log = createLogger('config:init');

const CONFIG_USER_DIR = 'config/user';
const CONFIG_DEFAULT_DIR = 'config/_default';
const USER_SITE_YML = path.join(CONFIG_USER_DIR, 'site.yml');
const DEFAULT_SITE_YML = path.join(CONFIG_DEFAULT_DIR, 'site.yml');

function ensureUserConfigInitialized(): InitResult {
  if (fs.existsSync(CONFIG_USER_DIR)) {
    return { initialized: false, source: 'existing' };
  }

  if (fs.existsSync(CONFIG_DEFAULT_DIR)) {
    fs.cpSync(CONFIG_DEFAULT_DIR, CONFIG_USER_DIR, { recursive: true });
    log.info('config/user 不存在，已从 config/_default 初始化用户配置（完全替换策略）');
    return { initialized: true, source: '_default' };
  }

  fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
  log.warn('未找到 config/_default，已创建空的 config/user；建议补齐 site.yml 与 pages/*.yml');
  return { initialized: true, source: 'empty' };
}

function ensureUserSiteYmlExists(): boolean {
  if (fs.existsSync(USER_SITE_YML)) {
    return true;
  }

  if (fs.existsSync(DEFAULT_SITE_YML)) {
    if (!fs.existsSync(CONFIG_USER_DIR)) {
      fs.mkdirSync(CONFIG_USER_DIR, { recursive: true });
    }
    fs.copyFileSync(DEFAULT_SITE_YML, USER_SITE_YML);
    log.info('未找到 config/user/site.yml，已从 config/_default/site.yml 复制');
    return true;
  }

  log.warn(
    '未找到可用的 site.yml，无法自动更新导航；请在 config/user/site.yml 添加 navigation（含 id: bookmarks）'
  );
  return false;
}

export { ensureUserConfigInitialized, ensureUserSiteYmlExists };
export type { InitResult };
