# MeNav 配置目录

## 目录

- [目录概述](#目录概述)
- [配置目录结构](#配置目录结构)
- [配置加载机制](#配置加载机制)
- [推荐用法](#推荐用法)
- [模块化配置文件](#模块化配置文件)
  - [网站基础配置](#网站基础配置)
  - [页面配置](#页面配置)
- [配置详解](#配置详解)
  - [site.yml 常用字段](#siteyml-常用字段)
  - [pages/ 页面配置](#pages-页面配置)
  - [多层级嵌套配置（2-4层）](#多层级嵌套配置2-4层)
- [配置优先级](#配置优先级)
- [配置示例](#配置示例)
- [最佳实践](#最佳实践)

## 目录概述

`config` 目录包含 MeNav 项目的所有配置文件，采用模块化的 YAML 格式组织。这些配置文件定义了网站的内容、结构、布局和功能，是定制个人导航站的核心。

## 配置目录结构

配置系统采用分层结构，清晰分离默认配置和用户配置：

```
config/
├── _default/           # 默认配置目录
│   ├── site.yml        # 默认网站基础配置（含导航配置）
│   └── pages/          # 默认页面配置
│       ├── common.yml   # 示例：默认首页（navigation 第一项）
│       ├── projects.yml # 项目页
│       ├── articles.yml # 文章页
│       └── bookmarks.yml # 书签页
└── user/               # 用户配置目录（覆盖默认配置）
    ├── site.yml        # 用户自定义网站配置（含导航配置）
    └── pages/          # 用户自定义页面配置
        ├── common.yml  # 示例：与 navigation 第一项对应
        └── ...
```

## 配置加载机制

MeNav 配置系统采用“完全替换”策略（不合并），按以下优先级选择**唯一**的一套配置目录：

1. 若存在 `config/user/`，则只加载该目录下的配置，并**完全忽略** `config/_default/`
2. 否则加载 `config/_default/` 作为默认配置

也就是说：`config/user/` 一旦存在，就需要包含一套完整的配置（例如 `site.yml` 与必要的 `pages/*.yml`），系统不会把缺失部分从默认配置补齐。

## 推荐用法

为避免文档与配置字段长期不同步，建议按以下方式使用与维护：

1. **首次使用**：完整复制 `config/_default/` 到 `config/user/`，再按需修改。
2. **字段与结构的权威参考**：
   - 全局配置：[`_default/site.yml`](_default/site.yml)
   - 页面配置：[`_default/pages/`](_default/pages/)
3. **多层级嵌套书签示例**：[`_default/pages/bookmarks.yml`](_default/pages/bookmarks.yml)（包含2层、3层、4层结构示例；`subgroups` 可参考下方说明或由导入脚本生成）

## 模块化配置文件

### 网站基础配置

`site.yml` 定义网站的基本信息和全局设置：

- 网站标题、描述和关键词
- 作者信息和版权声明
- 字体配置、图标模式等全局设置
- 全局元数据和站点参数
- 个人资料和社交媒体链接
- 导航菜单配置（侧边栏导航项、页面标题和图标、页面顺序和可见性）

> **注意**：导航配置仅支持写在 `site.yml` 的 `navigation` 字段中。

### 页面配置

`pages/` 目录下的配置文件定义各个页面的内容：

- `common.yml`: 示例首页（本质上是普通页面；首页由 navigation 第一项决定，不要求必须叫 home）
- `projects.yml`: 项目展示配置
- `articles.yml`: 文章列表配置
- `bookmarks.yml`: 书签页面配置
- 其他自定义页面配置（可按需新增/删除；与 `site.yml -> navigation[].id` 对应）

## 配置详解

本章节用于补齐“怎么配才是对的”这类细节说明。为了避免示例长期过时，字段与结构的权威参考始终以默认配置为准：

- 全局配置：[`_default/site.yml`](_default/site.yml)
- 页面配置：[`_default/pages/`](_default/pages/)

### site.yml 常用字段

`site.yml` 中字段较多，以下是常用项的解释与注意点（完整字段请以默认配置为准）：

1. **基础信息**
   - `title`：站点标题
   - `description`：站点描述（SEO/分享）
   - `author`：作者/署名
   - `favicon`、`logo_text`：站点图标与左上角 Logo 文本

2. **图标模式（隐私相关）**
   - `icons.mode: favicon | manual`
   - `favicon`：会请求第三方服务（Google）获取站点 favicon，失败自动回退到 Font Awesome 图标
   - `manual`：完全使用手动 Font Awesome 图标，不发起外部请求（适合内网/离线/隐私敏感场景）

3. **字体**
   - `fonts.*.source: google | system`
   - `system`：使用系统字体，加载更快；`google`：可选字体更多但可能受网络影响
   - 中文站点建议选择支持中文与字重的字体（如 `Noto Sans SC`）；请确保所选字体包含配置的字重，否则可能显示异常

4. **顶部欢迎信息与社交链接**
   - `profile`：首页顶部欢迎信息
   - `social`：侧边栏底部社交链接
   - `profile.title` / `profile.subtitle`：分别对应首页顶部主标题与副标题

5. **导航**
   - `navigation[]`：页面入口列表，`id` 需唯一，并与 `pages/<id>.yml` 对应（例如 `id: common` 对应 `pages/common.yml`）
   - 默认首页由 `navigation` 数组顺序决定：**第一项即为首页（默认打开页）**，不再使用 `active` 字段
   - 图标使用 Font Awesome 类名字符串（例如 `fas fa-home`、`fab fa-github`）
   - 导航显示顺序与数组顺序一致，可通过调整数组顺序改变导航顺序

6. **RSS（articles Phase 2）**
   - `rss.*`：仅用于 `npm run sync-articles`（联网抓取 RSS/Atom 并写入缓存）
   - `npm run build` 默认不联网；无缓存时 `articles` 页面会回退到 Phase 1 的站点入口展示
   - articles 页面会按 `articles.yml` 的分类进行聚合展示：某分类下配置的来源站点，其文章会显示在该分类下
   - 抓取条数默认：每个来源站点抓取最新 8 篇（可通过 `site.yml -> rss.articles.perSite` 或 `RSS_ARTICLES_PER_SITE` 调整）
   - 默认配置已将 `rss.cacheDir` 设为 `dev`（仓库默认 gitignore），避免误提交缓存文件；可按需改为自定义目录
   - GitHub Pages 部署工作流会在构建前自动执行 `npm run sync-articles`，并支持定时触发（默认每天 UTC 02:00；可在 `.github/workflows/deploy.yml` 调整）

7. **GitHub（projects 热力图，可选）**
   - `github.username`：你的 GitHub 用户名（用于 projects 页面标题栏右侧贡献热力图）
   - `github.heatmapColor`：热力图主题色（不带 `#`，例如 `339af0`）
   - `github.cacheDir`：projects 仓库元信息缓存目录（默认 `dev`，仓库默认 gitignore）
   - projects 仓库统计信息（language/stars/forks）由 `npm run sync-projects` 自动抓取并写入缓存；`npm run build` 默认不联网
   - GitHub Pages 部署工作流会在构建前自动执行 `npm run sync-projects`，并支持定时触发（默认每天 UTC 02:00；可在 `.github/workflows/deploy.yml` 调整）

### pages/ 页面配置

页面配置位于 `pages/*.yml`，每个文件对应一个页面内容，文件名与导航 `id` 对应：

- `pages/common.yml`：示例首页（通常是 `categories -> sites`）
- `pages/projects.yml` / `articles.yml`：示例页面（可按需删改）
- `pages/bookmarks.yml`：书签页（通常由导入脚本生成，也可以手动维护）

> 提示：自定义页面时，先在 `site.yml` 的 `navigation` 中增加一个 `id`，再创建同名的 `pages/<id>.yml`。
>
> 支持“可删除”：如果 `navigation` 中存在某个页面 `id`，但 `pages/<id>.yml` 不存在，构建仍会生成该页面（标题回退为导航名称、分类为空、模板默认使用通用 `page`）。
>
> 站点描述建议简洁（例如不超过 30 个字符），以保证卡片展示更美观。

#### 通用 page 页面配置（推荐，用于 friends 等普通页面）

对不需要特殊渲染的页面（例如“友链/朋友”页），建议使用通用 `page` 模板，并保持 `categories -> sites`（可选更深层级）：

```yaml
title: 示例页面
subtitle: 示例副标题
template: page

categories:
  - name: 示例分类
    icon: fas fa-folder
    sites:
      - name: 示例站点
        url: https://example.com
        icon: fas fa-link
        description: 示例描述
```

兼容说明：

- 若历史配置仍使用顶层 `sites`（旧结构），系统会自动映射为一个分类容器以保持页面结构一致（当前仅对 friends/articles 提供该兼容）。

### 多层级嵌套配置（2-4层）

书签与分类支持 2~4 层嵌套，用于更好组织大量站点。建议直接参考默认示例：

- 多层级结构示例：[`_default/pages/bookmarks.yml`](_default/pages/bookmarks.yml)（包含2层、3层、4层结构示例）

层级命名约定（自顶向下）：

1. `categories`：顶层分类
2. `subcategories`：子分类
3. `groups`：分组
4. `subgroups`：子分组
5. `sites`：站点（叶子节点）

若你需要第 4 层（`subgroups`），结构示例（片段）：

```yaml
categories:
  - name: 示例分类
    subcategories:
      - name: 示例子分类
        groups:
          - name: 示例分组
            subgroups:
              - name: 示例子分组
                sites:
                  - name: 示例站点
                    url: https://example.com
```

#### 向后兼容性

- 原有二层结构（`categories -> sites`）无需修改即可继续使用
- 系统会自动识别层级结构并匹配对应的模板/样式
- 允许在同一份配置中混用不同层级（例如某些分类是二层，某些分类是三/四层）

## 配置优先级

MeNav 配置系统采用“完全替换”策略：只会选择一套目录加载，不会把 `user` 与 `_default` 混合合并。

- 若存在 `config/user/`：只加载 `config/user/`，并**完全忽略** `config/_default/`
- 否则：加载 `config/_default/`

在“同一套目录”内，各文件的关系是：

- `site.yml`：站点全局配置（包含 `navigation` 等）
- `pages/*.yml`：各页面配置（文件名需与 `navigation.id` 对应）

## 配置示例

### 网站配置示例 (site.yml)

```yaml
# 网站基本信息
title: "我的个人导航"
description: "个人收藏的网站导航页"
keywords: "导航,网址,书签,个人主页"

# 个人资料配置
profile:
  title: "个人导航站"
  subtitle: "我收藏的精选网站"

# 字体配置
fonts:
  title:
    family: Roboto
    weight: 600
    source: google
  subtitle:
    family: Noto Sans SC
    weight: 500
    source: google
  body:
    family: Noto Sans SC
    weight: 400
    source: google
  
# 社交媒体链接
social:
  - name: "GitHub"
    url: "https://github.com/username"
    icon: "fab fa-github"
  - name: "Twitter"
    url: "https://twitter.com/username"
    icon: "fab fa-twitter"

# 导航配置
navigation:
  - name: "常用"
    icon: "fas fa-star"
    id: "common"
  - name: "项目"
    icon: "fas fa-project-diagram"
    id: "projects"
  - name: "文章"
    icon: "fas fa-book"
    id: "articles"
  - name: "书签"
    icon: "fas fa-bookmark"
    id: "bookmarks"
```

### 通用页面配置示例（例如 common.yml）

```yaml
# 页面分类配置
categories:
  - name: "常用工具"
    icon: "fas fa-tools"
    sites:
      - name: "Google"
        url: "https://www.google.com"
        description: "全球最大的搜索引擎"
        icon: "fab fa-google"
      - name: "GitHub"
        url: "https://github.com"
        description: "代码托管平台"
        icon: "fab fa-github"
  
  - name: "学习资源"
    icon: "fas fa-graduation-cap"
    sites:
      - name: "MDN Web Docs"
        url: "https://developer.mozilla.org"
        description: "Web开发技术文档"
        icon: "fab fa-firefox-browser"
```

## 最佳实践

1. **目录结构**:
   - 总是在 `user/` 目录下创建您的配置
   - 不要直接修改 `_default/` 中的文件

2. **文件命名**:
   - 遵循现有的文件命名约定
   - 自定义页面配置应使用有意义的名称

3. **配置管理**:
   - 利用模块化结构分类管理配置
   - 首次使用建议先完整复制 `config/_default/` 到 `config/user/`，再按需修改
   - 定期备份您的用户配置

4. **配置验证**:
   - 修改配置后运行 `npm run check`（语法检查 + 单测 + 构建）
   - 需要本地预览时运行 `npm run dev`（命令入口见 [`../README.md#快速开始`](../README.md#快速开始)）
   - 确保 YAML 语法正确无误
