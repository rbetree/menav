# MeNav 源代码目录

## 架构概述

MeNav 现在使用 Astro 负责静态页面渲染，继续保留原有 YAML 配置与 vanilla JS 运行时。构建目标仍是单页导航站：`dist/index.html` 内包含所有 `.page` 容器，运行时通过 `?page=<id>` 切换页面。

Astro 现代化迁移已完成；以下是重构后的核心边界：

核心边界：

- `src/pages`：Astro 页面入口，当前包含 `index.astro` 和默认 404。
- `src/layouts`：页面外壳，负责侧边栏、搜索框、全局脚本和运行时配置注入。
- `src/components`：Astro 组件，负责导航、分类、分组、站点卡片、首页仪表盘等 DOM 输出。
- `src/lib`：构建期核心能力，包含正式库入口、配置加载、`site-model`、缓存读取、Markdown 渲染、字体 HTML、搜索索引和安全工具。
- `src/lib/site-model`：单一站点模型层。`buildSiteModel()` 只消费已解析配置与外部数据，不直接读 Markdown、缓存或文件系统。
- `src/lib/bookmarks`：书签导入的 parser、icons、serializer、writer；`src/bookmark-processor.ts` 只负责 CLI 编排。
- `src/runtime`：浏览器端运行时，负责搜索、主题、侧边栏、路由、Todo、tooltip 和运行时配置读取。
- `src/bookmark-processor.ts`：浏览器书签导入 CLI，负责选择 HTML 文件、调用书签模块、写入书签页并补充导航。
- `src/lib/config/init.ts`：用户配置初始化，供 `npm run init-config` 和书签导入复用。

## 构建流程

常用命令保持不变：

```bash
npm run dev
npm run dev:offline
npm run dev:astro
npm run init-config
npm run build
npm run check
npm run check:fast
npm run check:browser
npm run test:browser
```

流程摘要：

1. `scripts/build.ts` 清理 `dist/` 和生成型 `public/` 资源，默认不执行联网同步。
2. `scripts/prepare-astro-public.ts` 读取配置，收集 Markdown、RSS 缓存、projects 缓存、书签更新时间等外部数据，并调用 `buildSiteModel()` 生成搜索索引和运行时配置。
3. `scripts/build-runtime.ts` 将 `src/runtime/index.ts` 打包为 `public/script.js`。
4. `scripts/run-astro-build.ts` 执行 Astro build，`src/pages/index.astro` 使用 `loadConfig()`、外部数据 loader 和 `buildSiteModel()` 生成单页站点。
5. 需要刷新联网缓存时显式运行 `npm run sync`；部署工作流会先同步，再离线构建。

`npm run generate` 通过 `scripts/generate.ts` 执行同一套静态站点生成流程，语义同样是离线构建；可复用库能力从 `src/lib/index.ts` 进入。包根只暴露 `loadConfig()`、`buildSiteModel()`、`buildSearchIndex()` 和 `ConfigError` / `BuildError` / `FileError`。

`npm run dev` 会显式传入 `sync: true`，先刷新联网缓存再构建并启动静态服务；`npm run dev:offline` 显式 `sync: false`，仅使用现有缓存。

`npm run dev:astro` 会先运行 `scripts/prepare-astro-public.ts` 并启动 runtime esbuild watch，然后通过 Astro dev server 提供组件级快速刷新。它监听 `config/`、`assets/` 和数据准备相关 `src/lib/*` 目录，变更后重新准备 `public/` 资源；默认 `npm run dev` 仍保留为构建后静态服务。

`npm run check` 默认等同于 `npm run check:fast`，覆盖 lint、单元测试、构建、最终审计和 TypeScript 类型检查，不启动真实浏览器。`npm run check:browser` 会先构建，再通过 `scripts/test-browser.ts` 启动本地 `dist/` 静态服务，并执行 `test/browser/contract.ts` 覆盖真实浏览器中的路由、运行时配置注入、关键 `data-*`、主题和搜索契约。

## 运行时契约

Astro 组件修改时必须保持以下契约稳定：

- 页面仍为单页模型：所有导航页面在 `index.html` 中对应一个 `.page#<id>` 容器。
- 运行时导航仍使用 `/?page=<id>` 和 `/?page=<id>#<categorySlug>`；未知路径不做旧式自动回跳。
- 页面中保留 `#menav-runtime-config` 运行时配置注入，数据来自 `SiteModel.runtimeConfigJson`。
- 导航、分类、站点、社交链接保留关键 `data-*`：`data-type`、`data-id`、`data-name`、`data-url`、`data-icon`、`data-container` 等。
- `pinyin-match.js` 继续作为全局脚本加载，搜索逻辑优先读取 `search-index.json`，并继续使用全局 `PinyinMatch`。搜索索引由 `buildSearchIndex(siteModel)` 从 `siteModel.searchSources` 生成。

## 开发原则

- 优先改数据准备和 Astro 组件边界，避免把运行时行为散落到组件内。
- 配置结构不保留旧扁平页面兼容分支；新增字段要先落到 `config/_default` 和 `config/README.md`。
- 视觉层保持在 `assets/style.css` 与 `assets/styles/`，Astro 迁移本身不承担 UI 重设计。
- 测试优先断言数据行为、构建产物结构和运行时契约，不再依赖旧模板文件。
