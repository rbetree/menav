import fs from 'node:fs';
import path from 'node:path';
import type { ResolvedConfig } from '../../src/types/config';
import type { CategoryItem } from '../../src/types/page';
import type { SiteItem } from '../../src/types/site';
import { collectSiteExternalData } from '../../src/lib/site-model/external-data.ts';
import { ConfigError } from '../../src/lib/errors.ts';
import { isSnapshotAssetPath } from '../../src/shared/snapshot-assets.ts';

type SeedSite = Record<string, unknown>;
type SeedCategory = {
  label: string;
  metadata: Record<string, unknown>;
  kind: string;
  foldable?: boolean;
  sites: SeedSite[];
  categories: SeedCategory[];
};

function siteToSeed(node: SiteItem, kind: string): SeedSite {
  const { name, url, description, icon, faviconUrl, external, ...metadata } = node;
  return { name, url, description, icon, faviconUrl, external, metadata, kind };
}

function categoryToSeed(node: CategoryItem, kind: string): SeedCategory {
  const { name, sites, items, subcategories, groups, subgroups, foldable, ...metadata } = node;
  return {
    label: name || '未命名分类',
    metadata,
    kind,
    foldable: typeof foldable === 'boolean' ? foldable : true,
    sites: [
      ...(sites ?? []).map((site) => siteToSeed(site, 'sites')),
      ...(items ?? []).map((site) => siteToSeed(site, 'items')),
    ],
    categories: [
      ...(subcategories ?? []).map((child) => categoryToSeed(child, 'subcategories')),
      ...(groups ?? []).map((child) => categoryToSeed(child, 'groups')),
      ...(subgroups ?? []).map((child) => categoryToSeed(child, 'subgroups')),
    ],
  };
}

/** 初次迁移读取所有业务输入，后续公开构建只使用这份数据在 D1 中的投影。 */
export function createSeed(config: ResolvedConfig) {
  const assets: Record<string, string> = {};
  const addAsset = (source: string, destination: string) => {
    if (!fs.existsSync(source)) throw new ConfigError('种子引用的图片不存在', [source]);
    if (!isSnapshotAssetPath(destination)) {
      throw new ConfigError('不支持的图片路径', [destination]);
    }
    const bytes = fs.readFileSync(source);
    if (bytes.length > 500_000) throw new ConfigError('单张种子图片不能超过 500 KB', [source]);
    assets[destination] = bytes.toString('base64');
  };
  const localIcon = (raw: unknown) => {
    if (typeof raw !== 'string' || /^https?:\/\//i.test(raw)) return;
    const relative = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
    if (relative.startsWith('assets/')) addAsset(path.resolve(relative), relative);
  };
  const visit = (node: CategoryItem) => {
    [...(node.sites ?? []), ...(node.items ?? [])].forEach((site) => localIcon(site.faviconUrl));
    [...(node.subcategories ?? []), ...(node.groups ?? []), ...(node.subgroups ?? [])].forEach(
      visit
    );
  };
  const favicon = config.site.favicon;
  if (favicon) {
    const candidates = [path.join('assets', favicon), favicon];
    const source = candidates.find((candidate) => fs.existsSync(candidate));
    if (!source) throw new ConfigError('站点图标不存在', [favicon]);
    addAsset(source, favicon.replace(/^\.\//, '').replace(/^\//, ''));
  }
  const pages = config.navigation.map((nav) => {
    const page = config.pages[nav.id] ?? {};
    const { categories, template, ...metadata } = page;
    const { id, name, hidden, ...navigation } = nav;
    (categories ?? []).forEach(visit);
    if (template === 'content' || (!template && id === 'content')) {
      const content = metadata.content ?? {};
      if (typeof content.markdown !== 'string') {
        if (!content.file) throw new ConfigError(`内容页缺少正文：${id}`);
        metadata.content = {
          ...content,
          markdown: fs.readFileSync(path.resolve(content.file), 'utf8'),
        };
      }
    }
    return {
      id,
      label: name ?? page.title ?? id,
      hidden: Boolean(hidden),
      template,
      metadata,
      navigation,
      categories: (categories ?? []).map((cat) => categoryToSeed(cat, 'subcategories')),
    };
  });
  const external = collectSiteExternalData(config);
  // 正文已转为 Markdown，避免把消毒后的 HTML 当作主数据重复保存。
  delete external.content;
  const { navigation: _navigation, ...site } = config.site;
  return {
    settings: {
      site: JSON.stringify(site),
      externalData: JSON.stringify(external, (_key, value) =>
        value instanceof Map ? Object.fromEntries(value) : value
      ),
      assets: JSON.stringify(assets),
    },
    pages,
  };
}
