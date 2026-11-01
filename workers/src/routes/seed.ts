import { Hono } from 'hono';
import { commitEdit, type AdminEnv } from '../db/revision';
import { insertRows } from '../db/bulk';
import { sanitizeSiteUrl, sanitizeIconUrl } from '../safe-url';
import {
  object,
  text,
  bool,
  templateValue,
  pageMetadata,
  navigationMetadata,
  categoryMetadata,
  siteMetadata,
  requireContent,
} from '../validation';
import { getPageIdIssue } from '../../../src/lib/config/page-id';
import { siteConfigSchema } from '../../../src/lib/config/schema/site';
import { ApiError } from '../errors';
import { isSnapshotAssetPath, isSnapshotAssetData } from '../../../src/shared/snapshot-assets';

type Row = (string | number | null)[];

/** 种子是一次性整体替换；只要已有业务数据，再导入就必须显式 reset=1。 */
export const seedRoutes = new Hono<AdminEnv>();

seedRoutes.post('/', async (c) => {
  const body = object(await c.req.json());
  if (!Array.isArray(body.pages) || body.pages.length === 0)
    throw new ApiError(400, 'pages 必须是非空数组');
  const existing = await c.env.DB.prepare('SELECT id FROM pages LIMIT 1').first();
  if (existing && c.req.query('reset') !== '1') {
    throw new ApiError(409, '数据库已包含数据；清空重建需显式使用 ?reset=1', 'reset_required');
  }

  const settings = body.settings === undefined ? {} : object(body.settings, 'settings');
  const settingRows: Row[] = [];
  let allowedSchemes: unknown;
  for (const [key, value] of Object.entries(settings)) {
    if (!['site', 'externalData', 'assets'].includes(key))
      throw new ApiError(400, '不支持的配置键：' + key);
    if (typeof value !== 'string') throw new ApiError(400, 'settings 的值必须是 JSON 字符串');
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ApiError(400, key + ' 不是有效 JSON');
    }
    object(parsed, key);
    if (key === 'site' && !siteConfigSchema.safeParse(parsed).success)
      throw new ApiError(400, '站点配置不符合现有配置格式');
    if (key === 'site')
      allowedSchemes = (parsed as { security?: { allowedSchemes?: unknown } }).security
        ?.allowedSchemes;
    if (key === 'assets') {
      for (const [asset, data] of Object.entries(parsed as Record<string, unknown>)) {
        if (!isSnapshotAssetPath(asset) || !isSnapshotAssetData(data))
          throw new ApiError(400, '种子图片路径或数据无效：' + asset);
      }
    }
    settingRows.push([key, value]);
  }

  const pages: Row[] = [];
  const categories: Row[] = [];
  const sites: Row[] = [];
  const seen = new Set<string>();

  function walk(pageId: string, parentId: string | null, nodes: unknown[], depth: number): void {
    if (depth > 4 && nodes.length) throw new ApiError(400, '分类最多支持 4 层');
    nodes.forEach((raw, sort) => {
      const node = object(raw, '分类');
      const id = crypto.randomUUID();
      const metadata = categoryMetadata(node.metadata ?? {});
      const kind =
        node.kind ?? (depth <= 2 ? 'subcategories' : depth === 3 ? 'groups' : 'subgroups');
      if (!['subcategories', 'groups', 'subgroups'].includes(String(kind)))
        throw new ApiError(400, '分类 kind 无效');
      categories.push([
        id,
        pageId,
        parentId,
        text(node.label ?? '未命名', '分类名称'),
        sort,
        node.foldable === undefined ? 1 : Number(bool(node.foldable, 'foldable')),
        metadata,
        String(kind),
      ]);
      if (node.sites !== undefined && !Array.isArray(node.sites))
        throw new ApiError(400, 'sites 必须是数组');
      ((node.sites as unknown[]) ?? []).forEach((rawSite, siteSort) => {
        const site = object(rawSite, '站点');
        const url = sanitizeSiteUrl(site.url, allowedSchemes);
        if (url === null) throw new ApiError(400, '站点链接无效或使用不安全的协议');
        const favicon =
          site.faviconUrl == null || site.faviconUrl === ''
            ? null
            : sanitizeIconUrl(site.faviconUrl);
        if (site.faviconUrl && favicon === null) throw new ApiError(400, 'faviconUrl 无效');
        const siteKind = site.kind ?? 'sites';
        if (siteKind !== 'sites' && siteKind !== 'items') throw new ApiError(400, '站点 kind 无效');
        sites.push([
          crypto.randomUUID(),
          id,
          text(site.name, '站点名称'),
          url,
          site.description == null ? null : text(site.description, 'description', false),
          site.icon == null ? null : text(site.icon, 'icon', false),
          favicon,
          site.external === undefined ? 1 : Number(bool(site.external, 'external')),
          siteSort,
          siteMetadata(site.metadata ?? {}),
          siteKind,
        ]);
      });
      if (node.categories !== undefined && !Array.isArray(node.categories))
        throw new ApiError(400, 'categories 必须是数组');
      walk(pageId, id, (node.categories as unknown[]) ?? [], depth + 1);
    });
  }

  body.pages.forEach((raw, sort) => {
    const page = object(raw, '页面');
    const id = text(page.id, '页面 id');
    const issue = getPageIdIssue(id);
    if (issue) throw new ApiError(400, issue);
    if (seen.has(id)) throw new ApiError(400, '重复页面 id：' + id);
    seen.add(id);
    requireContent(
      page.template === undefined ? null : templateValue(page.template),
      id,
      pageMetadata(page.metadata ?? {})
    );
    pages.push([
      id,
      text(page.label ?? id, '页面名称'),
      sort,
      page.hidden === undefined ? 0 : Number(bool(page.hidden, 'hidden')),
      page.template === undefined ? null : templateValue(page.template),
      pageMetadata(page.metadata ?? {}),
      navigationMetadata(page.navigation ?? {}),
    ]);
    if (page.categories !== undefined && !Array.isArray(page.categories))
      throw new ApiError(400, 'categories 必须是数组');
    walk(id, null, (page.categories as unknown[]) ?? [], 1);
  });

  const db = c.env.DB;
  const statements = [
    db.prepare('DELETE FROM sites'),
    db.prepare('DELETE FROM categories'),
    db.prepare('DELETE FROM pages'),
    db.prepare('DELETE FROM settings'),
    ...insertRows(
      db,
      'pages',
      ['id', 'label', 'sort', 'hidden', 'template', 'metadata', 'navigation'],
      pages
    ),
    ...insertRows(
      db,
      'categories',
      ['id', 'page_id', 'parent_id', 'label', 'sort', 'foldable', 'metadata', 'kind'],
      categories
    ),
    ...insertRows(
      db,
      'sites',
      [
        'id',
        'category_id',
        'name',
        'url',
        'description',
        'icon',
        'favicon_url',
        'external',
        'sort',
        'metadata',
        'kind',
      ],
      sites
    ),
    ...insertRows(db, 'settings', ['key', 'value'], settingRows),
  ];
  // 留出版本检查等查询余量，避免突破 D1 Free 单请求查询配额。
  if (statements.length > 24) throw new ApiError(413, '种子过大，无法在一个事务内导入');
  await commitEdit(c, statements);
  return c.json({
    ok: true,
    reset: true,
    pages: pages.length,
    categories: categories.length,
    sites: sites.length,
  });
});
