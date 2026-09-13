import type { D1Database } from '@cloudflare/workers-types';
import { parseBookmarks, type BookmarkCategory } from '../../../src/lib/bookmarks/parser-core';
import { sanitizeHttpUrl } from '../safe-url';
import { commitRevision } from '../db/revision';
import { insertRows } from '../db/bulk';
import { ApiError } from '../errors';

export const BOOKMARKS_PAGE_ID = 'bookmarks';
type Row = (string | number | null)[];

export interface BookmarkImportResult {
  pageId: string;
  pages: number;
  categories: number;
  sites: number;
  truncated: number;
}

/** 共享纯解析器；清旧、建新和版本递增在同一事务中完成。 */
export async function importBookmarks(
  db: D1Database,
  html: string,
  revision: number
): Promise<BookmarkImportResult> {
  const data = parseBookmarks(html);
  const categories: Row[] = [];
  const sites: Row[] = [];

  function walk(
    parentId: string | null,
    category: BookmarkCategory,
    sort: number,
    kind: string
  ): void {
    const id = crypto.randomUUID();
    const { name, sites: inputSites, subcategories, groups, subgroups, ...metadata } = category;
    categories.push([
      id,
      BOOKMARKS_PAGE_ID,
      parentId,
      (name || '').trim() || '未命名',
      sort,
      1,
      JSON.stringify(metadata),
      kind,
    ]);
    (inputSites ?? []).forEach((site, siteSort) => {
      const url = sanitizeHttpUrl(site.url);
      if (!site.name?.trim() || url === null) return;
      const { name: siteName, url: _url, description, icon, ...siteMetadata } = site;
      sites.push([
        crypto.randomUUID(),
        id,
        siteName.trim(),
        url,
        description || null,
        icon || null,
        null,
        1,
        siteSort,
        JSON.stringify(siteMetadata),
        'sites',
      ]);
    });
    let childSort = 0;
    for (const [childKind, children] of [
      ['subcategories', subcategories],
      ['groups', groups],
      ['subgroups', subgroups],
    ] as const) {
      for (const child of children ?? []) walk(id, child, childSort++, childKind);
    }
  }

  data.categories.forEach((cat, i) => walk(null, cat, i, 'subcategories'));
  if (!sites.length)
    throw new ApiError(422, '未解析出有效书签，请选择浏览器导出的 Netscape 书签 HTML');
  const existing = await db
    .prepare('SELECT template FROM pages WHERE id = ?')
    .bind(BOOKMARKS_PAGE_ID)
    .first<{ template: string | null }>();
  if (existing && existing.template !== 'bookmarks')
    throw new ApiError(409, 'bookmarks 页面标识已被其他模板使用，请先调整该页面');

  const statements = [
    db
      .prepare(
        "INSERT INTO pages (id, label, sort, hidden, template) VALUES (?, '书签', (SELECT COALESCE(MAX(sort), -1) + 1 FROM pages), 0, 'bookmarks') ON CONFLICT(id) DO NOTHING"
      )
      .bind(BOOKMARKS_PAGE_ID),
    db
      .prepare(
        'DELETE FROM sites WHERE category_id IN (SELECT id FROM categories WHERE page_id = ?)'
      )
      .bind(BOOKMARKS_PAGE_ID),
    db.prepare('DELETE FROM categories WHERE page_id = ?').bind(BOOKMARKS_PAGE_ID),
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
  ];
  if (statements.length > 24) throw new ApiError(413, '书签过大，无法在一个事务内导入');
  await commitRevision(db, revision, statements);
  return {
    pageId: BOOKMARKS_PAGE_ID,
    pages: 1,
    categories: categories.length,
    sites: sites.length,
    truncated: data.truncated ?? 0,
  };
}
