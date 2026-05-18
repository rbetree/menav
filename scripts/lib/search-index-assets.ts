import fs from 'node:fs';
import path from 'node:path';

import type { ResolvedConfig } from '../../src/types/config';

import { MENAV_SEARCH_INDEX_FILE, buildSearchIndex } from '../../src/lib/search-index/index.ts';
import { buildSiteModel } from '../../src/lib/site-model/index.ts';
import { collectSiteExternalData } from '../../src/lib/site-model/external-data.ts';
import { getErrorMessage } from './public-assets.ts';

function writeSearchIndexAsset(config: ResolvedConfig): void {
  try {
    const model = buildSiteModel({ config, externalData: collectSiteExternalData(config) });
    const searchIndex = buildSearchIndex(model);
    fs.writeFileSync(path.join('public', MENAV_SEARCH_INDEX_FILE), JSON.stringify(searchIndex));
  } catch (error) {
    throw new Error(`写入搜索索引失败：${getErrorMessage(error)}`);
  }
}

export { writeSearchIndexAsset };
