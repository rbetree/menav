# 开发与架构说明

## 架构概述

MeNav 现在使用 Astro 负责静态页面渲染，继续保留原有 YAML 配置与 vanilla JS 运行时。构建目标仍是单页导航站：`dist/index.html` 首屏只包含初始活动页和搜索结果页的 `.page` 容器，其余导航页以 `<template data-page-template="<id>">` 输出，运行时通过 `?page=<id>` 切换并在首次访问时克隆。

Astro 现代化迁移已完成；以下是重构后的核心边界：

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

`npm run check` 默认等同于 `npm run check:fast`，覆盖 JS 语法与 Astro 检查、`test/**/*.node-test.ts` 单元测试、构建、最终审计和 TypeScript 类型检查，不启动真实浏览器。`npm run check:browser` 会先构建，再通过 `scripts/test-browser.ts` 启动本地 `dist/` 静态服务，并执行 `test/browser/contract.ts` 覆盖真实浏览器中的路由、运行时配置注入、关键 `data-*`、主题和搜索契约。

## 运行时契约

Astro 组件修改时必须保持以下契约稳定：

- 页面仍为单页模型：首屏只渲染初始活动页与 `search-results` 的 `.page#<id>`，其余导航页在 `index.html` 中以 `<template data-page-template="<id>">` 保存，`showPage` 首次切换时克隆到 `main.content` 并初始化该页的嵌套分类。
- 页面切换不发起网络请求；克隆后运行时清空 `state.pages` 缓存，搜索重置等模块必须按需重新查询 `.page`。
- 禁用 JavaScript 时只有首屏页面可见；模板页内的 `<script>` 不会执行，依赖脚本的页面必须保持 eager（当前为首页与搜索结果页）。
- 运行时导航仍使用 `/?page=<id>` 和 `/?page=<id>#<categorySlug>`；未知路径不做旧式自动回跳。
- 页面中保留 `#menav-runtime-config` 运行时配置注入，数据来自 `SiteModel.runtimeConfigJson`。
- 导航、分类、站点、社交链接保留关键 `data-*`：`data-type`、`data-id`、`data-name`、`data-url`、`data-icon`、`data-container` 等。
- `pinyin-match.js` 继续作为全局脚本加载，搜索逻辑优先读取 `search-index.json`，并继续使用全局 `PinyinMatch`。搜索索引由 `buildSearchIndex(siteModel)` 从 `siteModel.searchSources` 生成。

## 资源目录

`assets` 目录包含 MeNav 项目所需的所有静态资源文件，包括样式表、图标、图片等。这些资源文件直接被复制到生成的站点中，用于网站的展示和功能实现。

目录包含以下主要资源：

- **style.css**：样式入口文件
  - 通过 `@import` 聚合所有模块化 CSS
  - 构建时由 esbuild 合并压缩为单文件
- **styles/**：CSS 模块目录（详见下方）
- **menav.svg**：网站图标和项目 logo
  - 显示在浏览器标签页、书签和收藏夹中
  - SVG 格式，包含黑色字母 “M” 和蓝色向上箭头设计
- **preview_light.png / preview_dark.png**：主题预览图
  - 用于 README 文档展示

## CSS 模块化架构

样式采用模块化组织，构建时自动合并：

```text
assets/
├── style.css              # 入口文件（@import 聚合）
└── styles/
    ├── tokens.css         # 尺寸、间距、圆角、动效和派生 token
    ├── themes.css         # 深色默认主题与 Notion 风格浅色主题
    ├── base.css           # 基础层聚合入口
    ├── layout.css         # 布局层聚合入口
    ├── components.css     # 组件层聚合入口
    ├── utilities.css      # 工具/兜底层聚合入口
    ├── _variables.css     # 旧变量入口兼容层（转发 tokens/themes）
    ├── _base.css          # 全局重置、滚动条
    ├── _animations.css    # @keyframes 动画
    ├── _layout.css        # 页面容器布局
    ├── _sidebar.css       # 侧边栏组件
    ├── _search.css        # 搜索框组件
    ├── _cards.css         # 卡片组件（站点卡片、tooltip）
    ├── _cards-article.css # 文章卡片
    ├── _cards-repo.css    # 仓库卡片
    ├── _modal.css         # 模态框、表单
    ├── _content.css       # Markdown 内容页
    ├── _dashboard.css     # 仪表盘（时钟/Todo）
    ├── _category.css      # 分类层级、折叠和嵌套网格
    ├── _github-heatmap.css # GitHub 热力图
    ├── _responsive.css    # 全局响应式规则
    └── _main.css          # 剩余兜底样式
```

### 模块说明

| 模块                  | 职责                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `tokens.css`          | 尺寸、字体、间距、圆角、动效、半透明面与派生交互 token                                             |
| `themes.css`          | 默认深色主题、Notion 风格浅色主题、主题色阶覆盖                                                    |
| `base.css`            | 基础层聚合入口，导入 `_base.css` 与 `_animations.css`                                              |
| `layout.css`          | 布局层聚合入口，导入 `_layout.css`                                                                 |
| `components.css`      | 组件层聚合入口，导入侧边栏、搜索、卡片、表单、内容、仪表盘样式                                     |
| `utilities.css`       | 工具/兜底层聚合入口，导入 `_category.css`、`_github-heatmap.css`、`_responsive.css` 和 `_main.css` |
| `_variables.css`      | 旧变量入口兼容层，新代码不要继续扩展该文件                                                         |
| `_base.css`           | 全局重置、滚动条、遮罩层、主题切换按钮                                                             |
| `_animations.css`     | 所有 `@keyframes` 定义                                                                             |
| `_layout.css`         | 页面容器、欢迎区域、模板布局                                                                       |
| `_sidebar.css`        | 侧边栏、导航项、折叠状态、子菜单                                                                   |
| `_search.css`         | 搜索框、引擎下拉、快捷键提示                                                                       |
| `_cards.css`          | 站点卡片、网格布局、tooltip、编辑按钮                                                              |
| `_cards-article.css`  | 文章列表卡片布局、摘要和元信息                                                                     |
| `_cards-repo.css`     | 项目仓库卡片布局、统计信息和语言标记                                                               |
| `_modal.css`          | 模态框、表单控件、按钮样式                                                                         |
| `_content.css`        | Markdown 渲染（标题、代码块、表格等）                                                              |
| `_dashboard.css`      | 仪表盘网格、时钟卡片、Todo 列表                                                                    |
| `_category.css`       | 分类层级、折叠状态和嵌套站点网格                                                                   |
| `_github-heatmap.css` | projects 页 GitHub 热力图和第三方日历覆盖                                                          |
| `_responsive.css`     | 全局移动端、窄屏和桌面宽度响应式规则                                                               |
| `_main.css`           | 剩余兜底样式，包含搜索结果页、页面过渡和少量侧边栏遗留规则                                         |

### 构建流程

构建时 esbuild 会：

1. 解析 `style.css` 中的 `@import` 语句
2. 合并所有模块为单文件
3. 压缩输出到 `dist/style.css`

> **开发提示**：修改 CSS 后运行 `npm run build` 或 `npm run dev` 查看效果。

## 添加新资源

### 文件命名规范

- 使用小写字母和连字符 (`-`)
- 避免使用空格和特殊字符
- 名称应清晰表达文件用途

### CSS 扩展指南

1. **找到合适的模块**：根据功能选择对应的 `_*.css` 文件
2. **遵循命名规范**：使用 BEM 风格或现有选择器模式
3. **添加响应式支持**：在同一模块内添加 `@media` 查询
4. **Token 优先**：颜色、间距、圆角、阴影必须优先使用 `tokens.css` / `themes.css` 中定义的变量

### 图片优化

- 压缩图片以减小文件大小
- 使用 PNG、JPG、WebP 等 web 友好格式
- 考虑添加合适的分辨率版本

添加新资源后，构建系统会自动将这些文件复制到生成的网站中。

## 开发原则

- 优先改数据准备和 Astro 组件边界，避免把运行时行为散落到组件内。
- 配置结构不保留旧扁平页面兼容分支；新增字段要先落到 `config/_default` 和 [配置指南](configuration.md)。
- 视觉层保持在 `assets/style.css` 与 `assets/styles/`，Astro 迁移本身不承担 UI 重设计。
- 测试优先断言数据行为、构建产物结构和运行时契约，不再依赖旧模板文件。
