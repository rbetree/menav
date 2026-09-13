import fs from 'node:fs';
import type { CategoryItem, PageConfig } from './schema/page';
import type { SiteItem } from '../../types/site';
import type { ResolvedConfig } from '../../types/config';
import { ConfigError } from '../errors.ts';

type RecordValue = Record<string, unknown>;

function record(value: unknown, name: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ConfigError(`${name} 必须是对象`);
  return value as RecordValue;
}

function array(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new ConfigError(`${name} 必须是数组`);
  return value;
}

function bySort(values: unknown[]): RecordValue[] {
  return values
    .map((v) => record(v, '快照条目'))
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
}

function mapSite(site: RecordValue): SiteItem {
  return {
    ...record(site.metadata ?? {}, '站点 metadata'),
    name: site.name as string,
    url: site.url as string,
    ...(site.description !== undefined ? { description: site.description as string } : {}),
    ...(site.icon !== undefined ? { icon: site.icon as string } : {}),
    ...(site.faviconUrl !== undefined ? { faviconUrl: site.faviconUrl as string } : {}),
    ...(site.external !== undefined ? { external: site.external as boolean } : {}),
  };
}

function mapCategory(node: RecordValue): CategoryItem {
  const category: CategoryItem = {
    ...record(node.metadata ?? {}, '分类 metadata'),
    name: node.label as string,
  };
  if (typeof node.foldable === 'boolean') category.foldable = node.foldable;
  if (node.sort !== undefined) category.sort = Number(node.sort);
  const sites = bySort(array(node.sites ?? [], 'sites'));
  if (sites.length) category.sites = sites.map(mapSite);
  const children = bySort(array(node.categories ?? [], 'categories'));
  for (const key of ['subcategories', 'groups', 'subgroups'] as const) {
    const group = children.filter((child) => (child.kind ?? 'subcategories') === key);
    if (group.length) category[key] = group.map(mapCategory);
  }
  return category;
}

/** D1 序列化契约转回现有配置结构，不读取 YAML、不补读本地业务文件。 */
export function configFromSnapshot(input: unknown): RecordValue {
  const snapshot = record(input, '快照');
  if (
    snapshot.schemaVersion !== 1 ||
    !Number.isSafeInteger(snapshot.revision) ||
    Number(snapshot.revision) < 0
  ) {
    throw new ConfigError('快照版本或 revision 无效');
  }
  const settings = record(snapshot.settings, 'settings');
  const readSetting = (key: string) =>
    settings[key] === undefined ? {} : record(JSON.parse(String(settings[key])), key);
  const site = readSetting('site');
  const nodes = bySort(array(snapshot.pages, 'pages'));
  const navigation = nodes.map((page) => ({
    ...record(page.navigation ?? {}, 'navigation'),
    id: page.id,
    name: page.label,
    ...(page.hidden ? { hidden: true } : {}),
  }));
  const pages = Object.fromEntries(
    nodes.map((page) => [
      page.id,
      {
        ...record(page.metadata ?? {}, '页面 metadata'),
        ...(page.template ? { template: page.template } : {}),
        categories: bySort(array(page.categories ?? [], 'categories')).map(mapCategory),
      } as PageConfig,
    ])
  );
  if (new Set(nodes.map((p) => p.id)).size !== nodes.length)
    throw new ConfigError('快照包含重复页面 id');
  site.navigation = navigation;
  return {
    site,
    navigation,
    pages,
    fonts: site.fonts ?? {},
    profile: site.profile ?? {},
    social: site.social ?? [],
    icons: site.icons ?? {},
    snapshot: {
      revision: snapshot.revision,
      updatedAt: snapshot.updatedAt,
      externalData: readSetting('externalData'),
      assets: readSetting('assets'),
      ...(process.env.MENAV_SNAPSHOT_CACHE_DIR
        ? { cacheDir: process.env.MENAV_SNAPSHOT_CACHE_DIR }
        : {}),
    },
  };
}

export function loadSnapshotConfig(file: string): ResolvedConfig & RecordValue {
  try {
    return configFromSnapshot(JSON.parse(fs.readFileSync(file, 'utf8'))) as ResolvedConfig &
      RecordValue;
  } catch (error) {
    if (error instanceof ConfigError) throw error;
    throw new ConfigError('无法读取 D1 JSON 快照', [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}
