type PageRegistryEntry = {
  id?: unknown;
};

type RouteParseOptions = {
  pageRegistry?: PageRegistryEntry[] | null;
  homePageId?: unknown;
  fallbackPageId?: unknown;
};

type RouteState = {
  pageId: string;
  rawPageId: string;
  hash: string;
  shouldReplaceUrl: boolean;
};

type RoutePatch = {
  pageId?: string;
  hash?: string | null;
};

function normalizeText(value: unknown): string {
  return String(value === null || value === undefined ? '' : value).trim();
}

function decodeHash(value: unknown): string {
  const raw = normalizeText(value).replace(/^#/, '');
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

function getRegisteredPageIds(pageRegistry: PageRegistryEntry[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(pageRegistry)) return ids;

  pageRegistry.forEach((entry) => {
    const id = normalizeText(entry && typeof entry === 'object' ? entry.id : '');
    if (id) ids.add(id);
  });

  return ids;
}

function resolveFallbackPageId(ids: Set<string>, options: RouteParseOptions): string {
  const homePageId = normalizeText(options.homePageId);
  if (homePageId && ids.has(homePageId)) return homePageId;

  const fallbackPageId = normalizeText(options.fallbackPageId);
  if (fallbackPageId && (ids.size === 0 || ids.has(fallbackPageId))) return fallbackPageId;

  const first = ids.values().next();
  return first.done ? fallbackPageId || homePageId || 'home' : first.value;
}

function parseRouteFromHref(href: string, options: RouteParseOptions = {}): RouteState {
  const ids = getRegisteredPageIds(options.pageRegistry);

  try {
    const url = new URL(href, 'https://menav.local/');
    const rawPageId = normalizeText(url.searchParams.get('page'));
    const hasRegistry = ids.size > 0;
    const isKnownPage = rawPageId && (!hasRegistry || ids.has(rawPageId));
    const fallbackPageId = resolveFallbackPageId(ids, options);

    return {
      pageId: isKnownPage ? rawPageId : fallbackPageId,
      rawPageId,
      hash: decodeHash(url.hash),
      shouldReplaceUrl: Boolean(rawPageId && !isKnownPage),
    };
  } catch {
    const fallbackPageId = resolveFallbackPageId(ids, options);
    return {
      pageId: fallbackPageId,
      rawPageId: '',
      hash: '',
      shouldReplaceUrl: false,
    };
  }
}

function buildRoutePath(currentHref: string, patch: RoutePatch): string {
  try {
    const url = new URL(currentHref, 'https://menav.local/');

    if (typeof patch.pageId === 'string') {
      const pageId = normalizeText(patch.pageId);
      if (pageId) url.searchParams.set('page', pageId);
      else url.searchParams.delete('page');
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'hash')) {
      const hash = normalizeText(patch.hash);
      url.hash = hash ? `#${encodeURIComponent(hash)}` : '';
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const pageId = normalizeText(patch.pageId);
    const hash = normalizeText(patch.hash);
    return `${pageId ? `?page=${encodeURIComponent(pageId)}` : ''}${hash ? `#${encodeURIComponent(hash)}` : ''}`;
  }
}

export { buildRoutePath, decodeHash, getRegisteredPageIds, normalizeText, parseRouteFromHref };
export type { PageRegistryEntry, RouteParseOptions, RoutePatch, RouteState };
