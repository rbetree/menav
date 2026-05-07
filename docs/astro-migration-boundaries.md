# Astro 现代化迁移执行计划

本文是 MeNav 在完成 Astro 快速迁移后的后续开发计划。本文从
2026-05-07 起作为迁移工作的权威执行路线，下面阶段按顺序推进。

本文直接替代旧的本地边界说明。旧说明中与本文冲突的内容全部废弃，
不再作为开发依据。

## 总结论

MeNav 后续迁移不再停留在“能跑即可”的 Astro 包装层。项目目标是：

- 构建期核心从 JavaScript 迁移到 TypeScript。
- `src/generator` 退场，能力迁入 `src/lib`。
- Astro 组件消费 typed view data，不直接读取 YAML、缓存或同步产物。
- runtime 保持 vanilla JS 思路，但迁移为 TypeScript 模块。
- `window.MeNav` 作为稳定扩展 facade，内部实现可以重构。
- YAML 继续作为用户配置入口，但必须 schema 化、类型化、错误可定位。
- CSS 从全局大文件演进为 token、theme、layout、component 分层。
- 单页 `?page=<id>` 路由短期保留并固化；多页面路由暂不启动。

## 非目标

以下方向不做，除非后续有新的明确需求：

- 不把整站改成 React/Vue/Svelte SPA。
- 不用 Astro content collections 替换用户 YAML 配置。
- 不在没有扩展契约测试前大改 DOM 与 `data-*`。
- 不在 Phase 2 同时做视觉重设计。
- 不继续扩大 `src/generator`。

## 完成定义

本计划完成后，项目必须达到以下状态，缺一项都视为迁移未完成：

- 架构清晰：源码目录按页面层、组件层、数据层、运行时、脚本层分离。
- 类型完整：核心数据、配置、页面、runtime、扩展 API 都有共享 TS 类型。
- 入口清楚：CLI 入口在 `scripts/`，可复用库入口在 `src/lib/index.ts`。
- 旧命名清零：业务代码不再引用 `src/generator`，旧兼容入口按计划删除。
- 配置可靠：YAML 有 schema、默认值、字段级错误、文档和测试。
- 构建稳定：build/dev/check 共享 pipeline，失败模式可预测。
- Runtime 可维护：router/search/theme/sidebar/todo/extension-api 边界明确。
- 扩展契约稳定：`window.MeNav` 和关键 DOM `data-*` 有契约测试。
- 搜索可扩展：搜索索引由构建期生成，不依赖完整 DOM 扫描作为主路径。
- 样式可演进：CSS 有 token/theme/base/layout/component/utilities 分层。
- 文档可执行：新开发者只看本文、`src/README.md`、`config/README.md`
  和源码即可继续开发。
- 风险可见：每个保留兼容层都有删除阶段，不能留下永久临时方案。

## 目标架构

最终源码结构必须收敛为：

```text
src/
├── components/          # Astro UI 组件，只消费 view data
├── layouts/             # Astro 页面外壳
├── pages/               # Astro 路由入口
├── lib/                 # 构建期核心能力
│   ├── cache/
│   ├── config/
│   │   └── schema/
│   ├── content/
│   ├── errors.ts
│   ├── github/
│   ├── html/
│   ├── logging/
│   ├── security/
│   ├── site-data/
│   ├── view-data/
│   └── index.ts
├── runtime/             # 浏览器端 TypeScript runtime
│   ├── app/
│   ├── dom/
│   ├── extension-api/
│   └── index.ts
└── types/               # 跨层共享类型
```

脚本与样式最终结构必须收敛为：

```text
scripts/
├── lib/
├── build.js
├── build-site.js
├── check.js
├── dev.js
├── dev-astro.js
├── generate.js
└── sync-*.js

assets/styles/
├── tokens.css
├── themes.css
├── base.css
├── layout.css
├── components.css
└── utilities.css
```

## 模块依赖规则

依赖方向必须单向，禁止跨层反向依赖：

```text
config YAML
  -> src/lib/config
  -> src/lib/view-data
  -> Astro pages/layouts/components
  -> generated HTML/data
  -> src/runtime
```

规则：

- `src/lib` 不依赖 Astro 组件和浏览器 DOM。
- `src/components` 不读取文件系统、不读取 YAML、不直接访问缓存文件。
- `src/runtime` 不读取 Node API，不依赖 `src/lib` 的 Node-only 模块。
- `scripts` 可以编排 `src/lib`，但不能承载业务规则。
- `src/types` 只能放类型，不放运行时代码。
- `window.MeNav` 只能由 `src/runtime/extension-api` 组装和暴露。
- 安全 URL、HTML 转义、Markdown 渲染只能走 `src/lib/security` 和
  `src/lib/content`。
- 新增 public JSON 必须经过最小化处理，不能泄漏完整配置。

## 质量门禁

每个阶段必须满足：

- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run check`

阶段涉及浏览器交互、布局或 runtime 时，额外要求：

- 补充 Node 测试或浏览器级测试，覆盖用户可见行为。
- 对 `dist/index.html` 或 runtime bundle 的关键结构做断言。
- 记录 bundle 体积变化，避免无意识增长。

阶段涉及依赖新增时，额外要求：

- 说明为什么需要依赖。
- 确认依赖维护状态、许可证、bundle 影响。
- 更新 `package-lock.json`。

阶段涉及 CSS 或 UI 时，额外要求：

- 桌面和移动端都要验收。
- 明暗主题都要验收。
- 文本不能溢出按钮、卡片、侧边栏。
- 不破坏扩展依赖的 DOM 与 `data-*`。

## 测试矩阵

最终测试必须覆盖以下矩阵：

| 领域     | 必须覆盖                                                             |
| -------- | -------------------------------------------------------------------- |
| 配置     | `_default`、`user` 完全替换、缺失页面、非法字段、字段路径错误        |
| 页面数据 | 首页、普通页、projects、articles、bookmarks、content、search-results |
| 嵌套结构 | 2 层、3 层、4 层、slug 去重、external 默认值                         |
| 安全     | URL scheme 白名单、Markdown 禁 raw HTML、本地 faviconUrl             |
| Runtime  | 路由、hash、前进后退、搜索、主题、侧边栏、Todo、tooltip              |
| 扩展 API | getConfig、getAllElements、add/update/removeElement、事件            |
| 同步     | RSS/projects/heatmap 成功、失败、禁用、缓存缺失、离线                |
| 构建     | build、dev、dev:offline、generate、404、静态资源输出                 |
| 样式     | 明暗主题、移动端、桌面端、侧边栏折叠、搜索下拉                       |

## 文档规则

开发者只看计划和源码也能继续开发，靠以下文档保证：

- 本文记录路线、阶段、架构和验收。
- `src/README.md` 记录源码边界和模块职责。
- `config/README.md` 记录用户配置字段，并与 schema 保持一致。
- `README.md` 只写用户使用、部署和本地开发入口。
- `CHANGELOG.md` 记录用户可感知变化和 breaking changes。
- 每个阶段完成后，同步更新本文的状态，不保留过期计划。

## 开发流程

每次开始一个阶段时，按固定流程执行：

1. 读取本文对应 Phase。
2. 用 `rg` 找到当前旧引用和相关测试。
3. 先补或确认测试，再改实现。
4. 改动只覆盖当前 Phase，不预先实现后续 Phase。
5. 跑质量门禁。
6. 更新本文中该 Phase 的状态和遗留风险。
7. 用 Conventional Commit 单独提交。

阶段状态使用以下格式维护：

```text
状态：pending | in-progress | done
开始提交：<commit sha>
完成提交：<commit sha>
剩余风险：无 | <明确条目>
```

当前本文刚入库时，所有 Phase 默认为 `pending`，Phase 0 可开始执行。

## 遗留风险清零表

| 风险                     | 当前处理阶段 | 清零标准                        |
| ------------------------ | ------------ | ------------------------------- |
| `src/generator` 命名残留 | Phase 2-6    | 业务代码无 `src/generator` 引用 |
| JS 缺少类型约束          | Phase 1-7    | 核心数据和 runtime 均 TS 化     |
| YAML 错误提示弱          | Phase 4      | schema 给出字段路径             |
| Runtime DOM 约定隐式     | Phase 7      | selector 集中，扩展 API 有测试  |
| 搜索依赖 DOM 扫描        | Phase 8      | 构建期 search index 为主路径    |
| 单页路由散落             | Phase 9      | router 单模块负责 URL 状态      |
| CSS 全局膨胀             | Phase 10     | token/theme/component 分层完成  |
| dev 反馈慢               | Phase 11     | 提供 `dev:astro` 快速模式       |
| 兼容 re-export 永久化    | 各迁移阶段   | 每个 re-export 都有删除阶段     |

## 阶段路线

### Phase 0：计划入库与环境收口

状态：done
开始提交：6afd3ed
完成提交：本提交（提交后见 git log）
剩余风险：本地默认 Node 可能仍停留在 20.x；开发前必须按 README 运行 `nvm use` 并使用 Node.js `22.12+`。本阶段门禁使用 Node.js 22.22.2 验证。`npm ci` 提示既有依赖审计风险，非 Phase 0 范围，后续阶段单独处理。

目标：先让迁移计划、Node 版本、开发环境说明成为可跟踪内容。

交付：

- 提交 `.nvmrc`，固定 Node 主版本为 `22`。
- README 说明 Node.js `22.12+`、`nvm use`、Windows/WSL 不共用
  `node_modules`。
- 将本文从本地 ignored 草稿转为正式计划文档。
- 调整 `.gitignore`，不再整体忽略 `docs/`；如需本地私有笔记，改为
  忽略 `docs/local/` 或特定临时文件。
- 更新 `src/README.md`，声明本文是迁移路线入口。

验收：

- `git status` 能看到本文作为普通仓库文档。
- `npm run format:check -- README.md .nvmrc docs/astro-migration-boundaries.md`
  通过。
- `README.md`、`src/README.md`、本文对 Node 与迁移入口的描述一致。

### Phase 1：TypeScript 基础设施

状态：done
开始提交：cbd32af
完成提交：本提交（提交后见 git log）
剩余风险：`npm run check` 已在 Node.js 22.22.2 下通过，但 Astro 检查仍会输出既有 CommonJS 转 ESM 提示；业务实现、runtime 和旧 `src/generator` 迁移仍在后续阶段处理，Phase 1 仅完成共享类型与检查链路接入。

目标：先接入 TS 编译与检查能力，不立刻全仓改名。

交付：

- 新增 `tsconfig.json`，开启 `allowJs`、`checkJs: false`，让 JS 和 TS
  可共存。
- 新增 `src/types/`，先放共享类型，不迁业务实现。
- 新增核心类型：
  - `src/types/config.ts`
  - `src/types/page.ts`
  - `src/types/site.ts`
  - `src/types/runtime.ts`
  - `src/types/extension.ts`
- 调整 `npm run lint` 或 `npm run check`，确保 TypeScript 类型检查进入
  常规检查链路。
- 将 Astro 组件内重复的局部 Props 类型迁到共享类型。

验收：

- `npm run check` 通过。
- Astro 组件可 import `src/types/*`。
- 不出现重复定义的页面、分类、站点类型。
- `rg "interface Props" src/components src/layouts` 只允许组件私有 UI props，
  不允许重复业务数据结构。

### Phase 2：迁移 `src/generator/utils` 到 `src/lib` 并 TypeScript 化

状态：done
开始提交：b67bece
完成提交：5644659
剩余风险：旧 `src/generator/utils/*` re-export 已在 Phase 6 删除；仅 `src/generator.js` 顶层兼容入口按计划保留到后续 minor 版本。

目标：先迁最底层纯工具，建立 `src/lib` 方向。

交付：

- 新建目录：
  - `src/lib/errors.ts`
  - `src/lib/logging/logger.ts`
  - `src/lib/security/html.ts`
  - `src/lib/site-data/sites.ts`
  - `src/lib/site-data/page-meta.ts`
  - `src/lib/github/contributions.ts`
- 将以下旧模块迁入新位置并改为 TS：
  - `src/generator/utils/errors.js`
  - `src/generator/utils/logger.js`
  - `src/generator/utils/html.js`
  - `src/generator/utils/sites.js`
  - `src/generator/utils/pageMeta.js`
  - `src/generator/utils/githubContributions.js`
- 旧路径只保留临时 re-export，不再写业务逻辑。
- 新代码引用改到 `src/lib/*`。
- 在旧 re-export 文件顶部写明删除阶段：Phase 6。

验收：

- `rg "generator/utils" src scripts test` 只允许命中旧 re-export 文件和
  迁移说明。
- `npm test` 与 `npm run check` 通过。
- 日志、错误包装、安全链接、站点递归、GitHub 热力图行为不变。

### Phase 3：迁移配置系统到 `src/lib/config`

状态：done
开始提交：5644659
完成提交：本提交（提交后见 git log）
剩余风险：`src/generator/config/*` re-export 已在 Phase 6 删除；配置层 YAML schema 化已由 Phase 4 完成。验证：Node.js 22.22.2 下 `npm run format:check`、`npm run lint`、`npm test`、`npm run build`、`npm run check` 均通过；`npm run lint` 仍输出既有 CommonJS 转 ESM 提示。

目标：配置读取、解析、默认值、校验分层，并迁为 TypeScript。

交付：

- 新建：
  - `src/lib/config/loader.ts`
  - `src/lib/config/resolver.ts`
  - `src/lib/config/normalizer.ts`
  - `src/lib/config/validator.ts`
  - `src/lib/config/slugs.ts`
  - `src/lib/config/index.ts`
- 将 `src/generator/config/*` 迁入新结构。
- 明确职责：
  - loader：只读文件。
  - resolver：选择 `_default` 或 `user` 配置目录并组合文件。
  - normalizer：补默认值和结构标准化。
  - validator：输出字段路径明确的错误。
- 旧 `src/generator/config/*` 保留临时 re-export。
- `src/lib/config/index.ts` 成为配置系统唯一 public 入口。

验收：

- `rg "generator/config" src scripts test` 只允许命中旧 re-export 和迁移说明。
- 默认配置、用户配置、缺失页面、导航首页、slug 去重测试全部通过。
- 新增字段必须有类型、默认值、文档、测试。
- `src/lib/config` 不依赖 Astro、不依赖 runtime、不输出 HTML。

### Phase 4：YAML Schema 化

状态：done
开始提交：be9f6fb
完成提交：本提交（提交后见 git log）
剩余风险：新增 `zod` 作为配置层 schema 依赖，版本 4.4.3、MIT 许可证；仅用于 Node 构建期配置校验，不进入浏览器 runtime bundle。验证：Node.js 22.22.2 下 `npm run format:check`、`npm run lint`、`npm test`、`npm run build`、`npm run check` 均通过；`npm run lint` / `npm run check` 仍输出既有 CommonJS 转 ESM 提示。

目标：YAML 仍是用户入口，但内部必须 schema 校验和类型化。

交付：

- 引入 schema 库，默认选择 `zod`。
- 新建：
  - `src/lib/config/schema/site.ts`
  - `src/lib/config/schema/page.ts`
  - `src/lib/config/schema/shared.ts`
- 校验 `config/_default/site.yml`、`config/user/site.yml`、
  `pages/*.yml`。
- 错误信息必须包含字段路径，例如：
  `pages.bookmarks.categories[0].sites[1].url`。
- `config/README.md` 与 schema 保持一致。
- schema 输出类型作为配置层类型来源，禁止手写第二套配置类型。

验收：

- 错误配置测试能断言字段路径。
- 默认配置通过 schema。
- 用户配置完全替换策略不变。
- `config/README.md` 中的字段在 schema 中能找到对应定义。

### Phase 5：迁移 cache/content/view-data 到 `src/lib`

状态：done
开始提交：d2c44d6
完成提交：本提交（提交后见 git log）
剩余风险：`src/generator/cache/*`、`src/generator/html/*` re-export 已在 Phase 6 删除；`src/lib/render-data.js` 和 `src/lib/view-utils.js` 仍作为旧 lib 路径兼容层保留到后续清理。验证：Node.js 22.22.2 下 `npm run format:check`、`npm run lint`、`npm test`、`npm run build`、`npm run check` 均通过；`npm run lint` / `npm run check` 仍输出既有 CommonJS 转 ESM 提示。

目标：把 Astro 消费的数据准备层从旧 generator 命名中移出。

交付：

- 新建：
  - `src/lib/cache/articles.ts`
  - `src/lib/cache/projects.ts`
  - `src/lib/content/markdown.ts`
  - `src/lib/html/fonts.ts`
  - `src/lib/view-data/page-data.ts`
  - `src/lib/view-data/render-data.ts`
- 迁移：
  - `src/generator/cache/*`
  - `src/generator/html/markdown.js`
  - `src/generator/html/fonts.js`
  - `src/generator/html/page-data.js`
  - `src/lib/render-data.js`
  - `src/lib/view-utils.js`
- Astro 页面和组件只消费 view data，不读取原始 YAML 或缓存。
- `src/generator.js` 不再是数据能力入口。
- `src/lib/view-data` 输出结构必须与 `src/types/page.ts` 对齐。

验收：

- `rg "src/generator|../generator|./generator" src scripts test` 只允许命中
  兼容入口和迁移说明。
- articles Phase 2、projects repo card、content markdown、安全链接测试通过。
- `npm run build` 输出结构不变。
- `src/pages` 和 `src/components` 中不得出现 `fs`、`path`、`js-yaml`。

### Phase 6：`src/generator.js` 退场

状态：done
开始提交：d094473
完成提交：本提交（提交后见 git log）
剩余风险：`src/generator.js` 顶层兼容入口按计划保留一个后续 minor 版本并输出弃用提示；深层 `src/generator/*` re-export 已删除。验证：Node.js 22.22.2 下 `npm run format:check`、`npm run lint`、`npm test`、`npm run generate`、`npm run build`、`npm run check` 均通过；`npm run lint` / `npm run check` 仍输出既有 CommonJS 转 ESM 提示。

目标：旧生成器入口从主架构中退出。

交付：

- 新增正式库入口 `src/lib/index.ts`。
- 新增正式 CLI 入口 `scripts/generate.js` 或 `scripts/build-site.js`。
- `package.json`：
  - `main` 改为新的库入口，或移除无意义的库入口。
  - `npm run generate` 改为调用新 CLI。
- `src/generator.js` 只保留一个版本的兼容转发和弃用提示。
- 删除 Phase 2、Phase 3、Phase 5 留下的旧 re-export。

验收：

- `npm run generate`、`npm run build`、`npm run check` 通过。
- 文档不再推荐直接调用 `src/generator.js`。
- 一个后续 minor 版本后删除 `src/generator.js`。
- `rg "generator" src scripts test package.json README.md src/README.md`
  只允许命中迁移说明、历史 changelog 或兼容提示。

### Phase 7：Runtime TypeScript 化与模块边界整理

状态：done
开始提交：de5ee23
完成提交：本提交（提交后见 git log）
剩余风险：runtime 已迁移为 TypeScript 模块并补充扩展 facade/selector 边界测试；bundle 体积从 Phase 6 约 42028 bytes 增至 44802 bytes（+2774 bytes），主要来自 TS 模块边界和类型化后保留的 facade 结构。验证：Node.js 22.22.2 下 `npm run format:check`、`npm run lint`、`npm test`、`npm run build`、`npm run check` 均通过；`npm run lint` / `npm run check` 仍输出既有 CommonJS 转 ESM 提示，runtime 中 Safari 兼容用 `MediaQueryList.addListener/removeListener` 仍有弃用提示。

目标：浏览器端仍保持轻量 vanilla runtime，但实现迁为 TypeScript。

交付：

- `src/runtime/index.js` 改为 `src/runtime/index.ts`。
- esbuild 入口更新为 TS。
- runtime 结构调整为：

```text
src/runtime/
├── app/
│   ├── router.ts
│   ├── search/
│   ├── sidebar.ts
│   ├── theme.ts
│   └── todo.ts
├── dom/
│   └── selectors.ts
├── extension-api/
└── index.ts
```

- 当前 `src/runtime/menav/*` 迁入 `extension-api`。
- `window.MeNav` 只暴露稳定 facade：
  - `getConfig`
  - `getAllElements`
  - `addElement`
  - `updateElement`
  - `removeElement`
  - event API
- 所有关键 selector 集中到 `dom/selectors.ts`。
- runtime 模块导入共享类型，但不导入 Node-only `src/lib` 模块。

验收：

- `public/script.js` 仍由构建生成。
- 搜索、主题、侧边栏、Todo、tooltip 行为不回退。
- 扩展 API 测试覆盖 `window.MeNav` 主要方法。
- bundle 体积变化需要在 PR/提交说明中写明。
- `rg "document\\.querySelector|querySelectorAll|getElementById" src/runtime`
  只允许命中 DOM adapter 或明确的局部节点绑定。

### Phase 8：搜索索引从 DOM 扫描迁为构建期数据

状态：pending

目标：减少 runtime 对完整 DOM 的依赖，为未来多页面路由预留基础。

交付：

- 构建期生成 `public/search-index.json`。
- runtime 搜索优先读取 index，失败时回退 DOM 扫描一个版本。
- index 包含 page、category、site、article 基础字段。
- 拼音匹配继续可用。
- `menav-config.json` 与 `search-index.json` 职责分离，前者服务扩展配置，
  后者服务搜索。

验收：

- 本地搜索结果与当前 DOM 扫描结果一致。
- articles/projects/bookmarks/search-results 行为不回退。
- `search-index.json` 不包含不应暴露的整站配置。
- 搜索 index 有 schemaVersion。

### Phase 9：单页路由固化

状态：pending

目标：短期继续保留单页模型，但把路由做成正式架构选择。

交付：

- `src/runtime/app/router.ts` 统一处理：
  - `?page=<id>`
  - hash 分类跳转
  - active page
  - 浏览器前进后退
- 构建期输出页面注册表。
- 文档明确推荐 URL：`/?page=<id>`。
- 不恢复 `/<id> -> ?page=<id>` 自动回跳。
- 路由模块不得直接操作搜索、主题、扩展 API 内部状态。

验收：

- 首页、`?page=<id>`、`?page=<id>#<categorySlug>`、前进后退正常。
- 404 不误跳未知路径。
- 扩展定位不受影响。
- 路由行为有测试覆盖。

### Phase 10：CSS token 与主题系统

状态：pending

目标：不做大规模视觉重设计，先拆样式架构。

交付：

- 新建样式分层：
  - `assets/styles/tokens.css`
  - `assets/styles/themes.css`
  - `assets/styles/base.css`
  - `assets/styles/layout.css`
  - `assets/styles/components.css`
  - `assets/styles/utilities.css`
- 颜色、字体、间距、圆角、阴影全部 token 化。
- 默认主题和 Notion 风格主题都通过 token/theme 实现。
- Astro 组件可逐步使用 scoped style，但不改变扩展依赖 DOM。
- `assets/style.css` 最终只作为聚合入口或被明确替代。

验收：

- 默认主题视觉不回退。
- 主题切换只覆盖变量，不复制整套组件 CSS。
- 移动端和桌面端布局正常。
- 搜索、导航、扩展编辑不受影响。
- 新增颜色、间距、圆角、阴影必须来自 token。

### Phase 11：Astro dev 模式

状态：pending

目标：在稳定构建模式之外提供更快的开发反馈。

交付：

- 新增 `npm run dev:astro`。
- 启动前准备 public 资源。
- esbuild watch 监听 runtime。
- 监听 YAML/config/assets 变更并重新准备数据。
- `npm run dev` 暂时继续作为稳定构建后静态服务。
- `dev:astro` 连续满足验收后，在独立提交中将默认 `dev` 切换到 Astro
  dev 模式，并保留 `dev:static` 作为旧稳定模式。

验收：

- 修改 Astro 组件有快速刷新。
- 修改 YAML 后能重新准备页面数据。
- `npm run build` 与 dev 页面结构一致。
- dev 模式不绕过 schema 校验和 runtime bundle 生成。

## 执行顺序

严格按以下顺序推进：

1. Phase 0：计划入库与环境收口。
2. Phase 1：TypeScript 基础设施。
3. Phase 2：`generator/utils` 迁移到 `lib` 并 TS 化。
4. Phase 3：配置系统迁移。
5. Phase 4：YAML schema。
6. Phase 5：cache/content/view-data 迁移。
7. Phase 6：`src/generator.js` 退场。
8. Phase 7：runtime TS 化。
9. Phase 8：搜索索引构建期化。
10. Phase 9：单页路由固化。
11. Phase 10：CSS token 与主题系统。
12. Phase 11：Astro dev 模式。

## 每个阶段的通用规则

- 每个阶段单独提交，不混入下一阶段内容。
- 每个阶段都必须跑 `npm run check`。
- 涉及依赖新增时，先说明原因，再修改 `package.json` 和
  `package-lock.json`。
- 涉及用户配置字段时，必须同步默认配置、文档、schema、测试。
- 涉及 DOM 或 `data-*` 时，必须确认扩展契约测试仍覆盖。
- 新增 TS 类型后，不允许继续复制局部重复类型。
- 旧路径 re-export 只能临时存在，删除时间必须写在对应阶段说明中。

## 当前下一步

Phase 2 已启动，当前必须按阶段隔离完成以下事项：

1. 将 `src/generator/utils/*` 迁入 `src/lib/*` 并改为 TypeScript。
2. 将新代码引用切到 `src/lib/*`，旧路径仅保留 Phase 6 删除的临时 re-export。
3. 运行 `npm test` 与 `npm run check`，确认工具迁移行为不变。
4. 完成后更新本文中的 Phase 2 状态、提交信息与剩余风险，再进入 Phase 3。
