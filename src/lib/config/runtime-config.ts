import type { PageRegistryItem } from '../../types/page';

import { resolveTemplateNameForPage } from './page-template.ts';

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function makeJsonSafeForHtmlScript(jsonString: unknown): string {
  if (typeof jsonString !== 'string') {
    return '';
  }

  return jsonString.replace(/<\/script/gi, '<\\/script');
}

export function buildRuntimeConfig(renderData: AnyRecord | null): AnyRecord {
  const meta = renderData && isRecord(renderData._meta) ? renderData._meta : null;
  const version =
    meta && meta.version && String(meta.version).trim()
      ? String(meta.version).trim()
      : process.env.npm_package_version || '1.0.0';

  const pageTemplates: Record<string, string> = {};
  const pageRegistry: PageRegistryItem[] = [];
  if (renderData && Array.isArray(renderData.navigation)) {
    renderData.navigation.forEach((navItem: unknown, index: number) => {
      if (!isRecord(navItem)) return;
      const pageId = navItem.id ? String(navItem.id).trim() : '';
      if (!pageId) return;
      const template = resolveTemplateNameForPage(pageId, renderData);
      pageTemplates[pageId] = template;
      pageRegistry.push({
        id: pageId,
        name: navItem.name ? String(navItem.name).trim() : pageId,
        template,
        active: index === 0,
      });
    });
  }

  const site = renderData && isRecord(renderData.site) ? renderData.site : null;
  const security = site && isRecord(site.security) ? site.security : null;
  const allowedSchemes =
    security && Array.isArray(security.allowedSchemes) ? security.allowedSchemes : null;

  return {
    version,
    timestamp: new Date().toISOString(),
    icons: renderData && renderData.icons ? renderData.icons : undefined,
    data: {
      homePageId: renderData && renderData.homePageId ? renderData.homePageId : null,
      pageRegistry,
      pageTemplates,
      site: allowedSchemes ? { security: { allowedSchemes } } : undefined,
    },
  };
}
