# 更新说明（2025-12-27）

本文档用于说明“页面模板差异化改进”相关改动中，**配置层面的新增字段、减少字段与迁移要点**。内容与 [`README.md`](../README.md) 的“2025/12/27 更新记录”保持一致。

最后更新：2025-12-27

---

## 1. 新增/扩展的配置字段

### 1.1 `site.rss.*`（articles RSS 聚合 / 缓存）

用途：为 `articles` 页面提供 RSS/Atom 文章聚合数据，供 `npm run sync-articles` 联网抓取并写入缓存；`npm run build` 默认不联网，只读取缓存渲染。

关键字段（默认示例见 `config/_default/site.yml`）：

- `site.rss.enabled`：是否启用 RSS 抓取能力
- `site.rss.cacheDir`：缓存目录（建议 `dev/`，仓库默认 gitignore）
- `site.rss.fetch.*`：抓取参数（超时、并发、重试、重定向等）
- `site.rss.articles.*`：抓取条数与摘要长度（例如每站点最多 8 篇）

说明：

- RSS 抓取只影响 `articles` Phase 2（文章条目只读展示），不会影响扩展对“来源站点（sites）”的写回能力（构建会保留影子写回结构）。

---

### 1.2 `site.github.*`（projects 仓库元信息 + 热力图）

用途：

- projects 卡片可展示仓库元信息（language/stars/forks 等，只读），由 `npm run sync-projects` 联网抓取并写入缓存。
- projects 标题区右侧可选展示 GitHub 贡献热力图。

关键字段（默认示例见 `config/_default/site.yml`）：

- `site.github.username`：GitHub 用户名；为空则不展示热力图
- `site.github.heatmapColor`：热力图主题色（不带 `#`，如 `339af0`）
- `site.github.cacheDir`：仓库元信息缓存目录（建议 `dev/`）

说明：

- 仓库元信息来自 GitHub API，属于“时效性数据”，不会写回到 `pages/projects.yml`。

---

### 1.3 `pages/<id>.yml -> template`（页面模板选择）

用途：指定页面使用的内置页面类型（由 Astro 组件渲染）。

行为规则：

- 若 `template` 缺省：优先使用与页面 ID 同名的内置页面类型（如 `bookmarks/projects/articles/content`），不存在则回退到通用 `page` 页面。
- `bookmarks/projects/articles` 等特殊页建议显式配置 `template`，以减少误解。

---

## 2. 减少/不再支持的配置方式（Breaking）

### 2.1 根目录单文件配置 `config.yml` / `config.yaml`

当前版本不再回退读取根目录 `config.yml`/`config.yaml`。

迁移要点：

- 使用模块化配置目录：`config/user/`（优先级最高，完全替换）或 `config/_default/`（默认示例）。
- 推荐迁移方式：复制 `config/_default/` → `config/user/`，再按需修改 `site.yml` 与 `pages/*.yml`。

---

### 2.2 独立 `navigation.yml`

当前版本仅从 `site.yml -> navigation` 读取导航配置，不再读取 `navigation.yml`。

迁移要点：

- 将原 `navigation.yml` 的数组内容移动到 `config/user/site.yml` 的 `navigation:` 字段下。

---

### 2.3 `pages/home.yml -> 顶层 categories` 与 `home` 子菜单特例

当前版本不再维护“首页固定叫 `home`”的遗留逻辑（例如把 `pages/home.yml` 的分类提升到顶层 `config.categories`）。

迁移要点：

- 不要依赖固定页面 id `home`。
- 首页始终由 `site.yml -> navigation` 的**第一项**决定；其分类内容应写在对应的 `pages/<homePageId>.yml` 中。

---

### 2.4 `navigation[].active` 不再生效（首页不再靠 active 指定）

历史版本可能通过 `navigation[].active` 指定“默认打开页/首页”。

当前版本：

- 首页/默认打开页始终由 `site.yml -> navigation` 的**第一项**决定
- `active` 字段将被忽略（即使写了也不会生效）

迁移要点：

- 通过调整 `navigation` 数组顺序来设置首页（把希望作为首页的页面放到第一项）。

---

## 3. 与更新记录的对应关系（快速索引）

- 首页判定规则：`site.yml -> navigation` 第一项
- 页面类型：`pages/<id>.yml -> template`（缺省回退 `page`）
- bookmarks 更新时间：构建期注入（不需要新增配置字段）
- articles RSS：`site.rss.*` + `npm run sync-articles`
- projects 元信息/热力图：`site.github.*` + `npm run sync-projects`
- 兼容清理：移除 `config.yml/config.yaml`、`navigation.yml`、`home` 特例
