import type { D1Database } from '@cloudflare/workers-types';

/**
 * 形态二 D1 schema。
 *
 * 领域定案(见技术方案「四、数据层」与《动态后台能力-架构决策记录.md》):
 * D1 是现有 CategoryItem/SiteItem 类型结构(src/types/page.ts / site.ts)的持久化投影,
 * 非第二套领域模型。categories.parent_id 自引用用于把「任意深度嵌套分类树」
 * 无损编码进关系表(与现有 GroupItem = CategoryItem 同构)。
 *
 * 所有建表语句皆幂等(CREATE TABLE/INDEX IF NOT EXISTS),支持增量演进。
 * 每次引入新列/新表时应在此追加一条带版本注释的语句,而非改写历史表。
 */

// TABLES:顺序执行(外键引用先建父表)。不做依赖顺序问题——此处无跨表级联约束。
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

  // categories:任意深度嵌套分类树。parent_id=NULL 为顶层;子分类/分组/子群=子树节点。
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
  for (const stmt of TABLES) {
    await db.prepare(stmt).run();
  }
}