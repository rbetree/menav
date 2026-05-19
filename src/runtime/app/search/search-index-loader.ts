import type { RuntimeSearchIndexItem, RuntimeState } from '../../types';
import type { SearchIndexPayload } from '../../../types/search';

const { normalizeIndexItem } = require('./index-item.ts') as {
  normalizeIndexItem: (raw: unknown) => RuntimeSearchIndexItem | null;
};

const SEARCH_INDEX_SCHEMA_VERSION = 1;
const SEARCH_INDEX_URL = './search-index.json';

async function loadBuildSearchIndex(state: RuntimeState): Promise<void> {
  if (state.searchIndex.initialized || state.searchIndex.loading) return;

  state.searchIndex.loading = true;

  try {
    const response = await fetch(SEARCH_INDEX_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as SearchIndexPayload;
    if (payload.schemaVersion !== SEARCH_INDEX_SCHEMA_VERSION || !Array.isArray(payload.items)) {
      throw new Error('search index schema mismatch');
    }

    const items = payload.items
      .map((item) => normalizeIndexItem(item))
      .filter((item: RuntimeSearchIndexItem | null): item is RuntimeSearchIndexItem =>
        Boolean(item)
      );

    state.searchIndex.items = items;
    state.searchIndex.error = undefined;
    state.searchIndex.initialized = true;
    state.searchIndex.loading = false;
    state.searchIndex.source = 'build';
  } catch (error) {
    console.error('Error loading search index:', error);
    state.searchIndex.items = [];
    state.searchIndex.initialized = true;
    state.searchIndex.loading = false;
    state.searchIndex.source = 'build';
    state.searchIndex.error = error instanceof Error ? error.message : String(error);
  }
}

module.exports = {
  SEARCH_INDEX_SCHEMA_VERSION,
  SEARCH_INDEX_URL,
  loadBuildSearchIndex,
};
