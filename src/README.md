# MeNav 源代码目录

## 架构概述

MeNav 现在使用 Astro 负责静态页面渲染，继续保留原有 YAML 配置、vanilla JS 运行时和浏览器扩展契约。构建目标仍是单页导航站：`dist/index.html` 内包含所有 `.page` 容器，运行时通过 `?page=<id>` 切换页面。

Astro 现代化迁移按 [`docs/astro-migration-boundaries.md`](../docs/astro-migration-boundaries.md) 推进；该文档是阶段路线、源码边界和验收要求的入口。

核心边界：

- `src/pages`：Astro 页面入口，当前包含 `index.astro` 和默认 404。
- `src/layouts`：页面外壳，负责侧边栏、搜索框、全局脚本和扩展配置注入。
- `src/components`：Astro 组件，负责导航、分类、分组、站点卡片、首页仪表盘等 DOM 输出。
- `src/lib`：构建期核心能力，包含正式库入口、配置、缓存读取、Markdown 渲染、字体 HTML、页面 view data 和安全工具。
- `src/generator.js`：旧顶层兼容入口，仅保留弃用提示和对正式入口的转发；新代码不要直接依赖。
- `src/runtime`：浏览器端运行时，负责搜索、主题、侧边栏、路由、Todo、tooltip 和 `window.MeNav`。
- `src/bookmark-processor.js`：浏览器书签导入与用户配置初始化。

## 构建流程

常用命令保持不变：

```bash
npm run dev
npm run dev:offline
npm run build
npm run check
```

流程摘要：

1. `scripts/build.js` 清理 `dist/` 和生成型 `public/` 资源。
2. `sync-projects`、`sync-heatmap`、`sync-articles` 以 best-effort 方式刷新 `dev/` 缓存。
3. `scripts/prepare-astro-public.js` 读取配置，准备 CSS、`pinyin-match.js`、favicon、本地 `faviconUrl` 和 `menav-config.json`。
4. `scripts/build-runtime.js` 将 `src/runtime/index.ts` 打包为 `public/script.js`。
5. `scripts/run-astro-build.js` 执行 Astro build，产物输出到 `dist/`。

`npm run generate` 通过 `scripts/generate.js` 执行同一套静态站点生成流程；可复用库能力从 `src/lib/index.ts` 进入。

`npm run dev:offline` 会跳过联网同步，仅准备静态资源、打包运行时并构建 Astro 页面后启动本地静态服务。

## 扩展契约

Astro 组件修改时必须保持以下契约稳定：

- 页面仍为单页模型：所有导航页面在 `index.html` 中对应一个 `.page#<id>` 容器。
- 运行时导航仍使用 `?page=<id>` 和 `?page=<id>#<categorySlug>`。
- 页面中保留 `#menav-config-data`，独立配置文件保留 `menav-config.json`。
- 运行时保留 `window.MeNav` API。
- 导航、分类、站点、社交链接保留关键 `data-*`：`data-type`、`data-id`、`data-name`、`data-url`、`data-icon`、`data-container` 等。
- `pinyin-match.js` 继续作为全局脚本加载，搜索逻辑继续使用全局 `PinyinMatch`。

## 开发原则

- 优先改数据准备和 Astro 组件边界，避免把运行时行为散落到组件内。
- 配置结构保持兼容，新增字段要先落到 `config/_default` 和 `config/README.md`。
- 视觉层保持在 `assets/style.css` 与 `assets/styles/`，Astro 迁移本身不承担 UI 重设计。
- 测试优先断言数据行为、构建产物结构和扩展契约，不再依赖旧模板文件。
