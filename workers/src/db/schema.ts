import type { D1Database } from '@cloudflare/workers-types';

/**
 * 形态二 D1 schema。
 *
 * 领域定案(见技术方案「四、数据层」与《动态后台能力-架构决策记录.md》):
 * D1 是现有 CategoryItem/SiteItem 类型结构(src/types/page.ts / site.ts)的持久化投影,
 * categories.parent_id 表达分类树，写入层限制最多四层。
 *
 * 所有建表语句皆幂等(CREATE TABLE/INDEX IF NOT EXISTS),支持增量演进。
 * 每次引入新列/新表时应在此追加一条带版本注释的语句,而非改写历史表。
 */

// 按页面、分类、站点顺序建表，归属校验与级联删除由写入事务负责。
const TABLES = [
  // settings:site.yml 级配置(site_name/theme/icons/…) 的 kv 化
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  // pages:页面(navigation.id)
  `CREATE TABLE IF NOT EXISTS pages (
    id       TEXT PRIMARY KEY,          -- 页面 id(对应 navigation.id)
    label    TEXT NOT NULL,
    sort     INTEGER NOT NULL DEFAULT 0,
    hidden   INTEGER NOT NULL DEFAULT 0,
    template TEXT                       -- page/projects/articles/bookmarks
  )`,

  // categories:分类树。parent_id=NULL 为顶层；子分类、分组、子群均为子树节点。
  `CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    page_id    TEXT NOT NULL,           -- 所属页面(树根归属)
    parent_id  TEXT NULL,               -- 父分类;NULL=顶层;自引用表达多级嵌套
    label      TEXT NOT NULL,
    sort       INTEGER NOT NULL DEFAULT 0,
    foldable   INTEGER NOT NULL DEFAULT 0
  )`,

  // sites:站点,挂在嵌套树任意层的分类下(叶子或中间层)
  `CREATE TABLE IF NOT EXISTS sites (
    id           TEXT PRIMARY KEY,
    category_id  TEXT NOT NULL,         -- 所属分类(可任意层级)
    name         TEXT NOT NULL,
    url          TEXT NOT NULL,
    description  TEXT,
    icon         TEXT,
    favicon_url  TEXT,
    external     INTEGER NOT NULL DEFAULT 1,  -- 默认新标签打开(对齐现有默认)
    sort         INTEGER NOT NULL DEFAULT 0
  )`,

  // 索引:page 归属 + parent_id 树 + site 归属
  `CREATE INDEX IF NOT EXISTS idx_categories_page   ON categories(page_id)`,
  `CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sites_category    ON sites(category_id)`,
];

/** 幂等建表。每次请求入口调用,module 级缓存避免重复执行。 */
export async function applySchema(db: D1Database): Promise<void> {
  // 建表与初始化始终执行(全部 IF NOT EXISTS / OR IGNORE,幂等)。
  await db.batch([
    ...TABLES.map((stmt) => db.prepare(stmt)),
    db.prepare(`CREATE TABLE IF NOT EXISTS content_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      revision INTEGER NOT NULL CONSTRAINT revision_conflict CHECK(revision >= 0),
      published_revision INTEGER NOT NULL DEFAULT 0,
      build_nonce INTEGER NOT NULL DEFAULT 0,
      published_build_nonce INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS publication (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      job_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      build_nonce INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      deployment_id TEXT,
      deployment_url TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS snapshot_chunks (
      part INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    )`),
  ]);

  // 升级已有数据库时只追加列；不重建或清空业务表。
  for (const [table, columns] of Object.entries({
    pages: { metadata: "TEXT NOT NULL DEFAULT '{}'", navigation: "TEXT NOT NULL DEFAULT '{}'" },
    categories: {
      metadata: "TEXT NOT NULL DEFAULT '{}'",
      kind: "TEXT NOT NULL DEFAULT 'subcategories'",
    },
    sites: { metadata: "TEXT NOT NULL DEFAULT '{}'", kind: "TEXT NOT NULL DEFAULT 'sites'" },
    content_state: {
      build_nonce: 'INTEGER NOT NULL DEFAULT 0',
      published_build_nonce: 'INTEGER NOT NULL DEFAULT 0',
    },
    publication: { build_nonce: 'INTEGER NOT NULL DEFAULT 0' },
  })) {
    const existing = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    const names = new Set(existing.results.map((column) => column.name));
    for (const [column, definition] of Object.entries(columns)) {
      if (names.has(column)) continue;
      try {
        await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      } catch (error) {
        // 不同 isolate 可能同时完成探测；只接受另一个迁移已成功添加同名列的情况。
        if (!String(error).includes('duplicate column name: ' + column)) throw error;
      }
    }
  }

  // 列补齐之后再初始化与清理:INSERT 引用了新增列,必须晚于 ALTER。
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO content_state
        (id, revision, published_revision, build_nonce, published_build_nonce, updated_at)
      SELECT 1, CASE WHEN EXISTS(SELECT 1 FROM pages) THEN 1 ELSE 0 END, 0, 0, 0, ?`
      )
      .bind(new Date().toISOString()),
    db.prepare("DELETE FROM settings WHERE key = 'dirty'"),
  ]);
}
