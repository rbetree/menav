import fs from 'node:fs';
import path from 'node:path';

import type { AppConfig } from '../../src/types/config';

import { MENAV_SEARCH_INDEX_FILE, buildSearchIndex } from '../../src/lib/search-index/index.ts';
import { prepareSiteRenderData } from '../../src/lib/view-data/render-data.ts';
import { getErrorMessage } from './public-assets.ts';

function writeSearchIndexAsset(config: AppConfig): void {
  try {
    const renderData = prepareSiteRenderData(config);
    const searchIndex = buildSearchIndex(renderData.pages, renderData.renderContext);
    fs.writeFileSync(path.join('public', MENAV_SEARCH_INDEX_FILE), JSON.stringify(searchIndex));
  } catch (error) {
    throw new Error(`写入搜索索引失败：${getErrorMessage(error)}`);
  }
}

export { writeSearchIndexAsset };
