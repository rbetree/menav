# MeNav 模板目录

## 目录

- [模板系统概述](#模板系统概述)
- [目录结构](#目录结构)
- [模板类型](#模板类型)
  - [布局模板](#布局模板)
  - [页面模板](#页面模板)
  - [组件模板](#组件模板)
  - [多层级嵌套模板组件](#多层级嵌套模板组件)
- [模板数据流](#模板数据流)
- [模板使用示例](#模板使用示例)
- [最佳实践](#最佳实践)
- [扩展指南](#扩展指南)

## 模板系统概述

MeNav 项目使用 Handlebars 作为模板引擎，实现了组件化架构，将页面内容与逻辑分离。模板系统的核心优势：

- **组件复用** - 通过组件拆分实现代码复用
- **结构清晰** - 布局、页面、组件分离管理
- **扩展灵活** - 易于添加新页面和组件
- **维护简便** - 修改单个组件不影响其他部分

## 目录结构

```
templates/
├── layouts/      # 布局模板 - 定义页面整体结构
│   └── default.hbs   # 默认布局
├── pages/        # 页面模板 - 对应不同页面内容
│   ├── page.hbs      # 通用页面模板（默认/回退模板；普通页面常用）
│   ├── projects.hbs  # 项目页（repo 风格卡片）
│   ├── articles.hbs  # 文章页（RSS 聚合/只读文章条目）
│   ├── bookmarks.hbs # 书签页
│   └── search-results.hbs # 搜索结果页（内置）
├── components/   # 组件模板 - 可复用的界面元素
│   ├── page-header.hbs  # 统一标题区（首页/非首页/书签更新时间/项目热力图）
│   ├── navigation.hbs   # 导航组件
│   ├── site-card.hbs    # 站点卡片组件
│   ├── category.hbs     # 分类组件
│   └── ...
└── README.md     # 本文档
```

## 模板类型

### 布局模板

布局模板定义了整个页面的HTML结构，包含头部、导航栏、内容区和底部等基本框架。

**位置**: `templates/layouts/`

**主要布局**:
- `default.hbs` - 默认布局，定义整个页面框架

**示例**:
```handlebars
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>{{site.title}}</title>
    <!-- 其他头部元素 -->
</head>
<body>
    <div class="layout">
        <!-- 导航部分 -->
        <nav class="sidebar">
            {{> navigation navigationData}}
        </nav>
        
        <!-- 内容区域 -->
        <main class="content">
            {{#each pages}}
            <div class="page {{@key}}{{#if @first}} active{{/if}}" id="{{@key}}">
                {{{this}}}
            </div>
            {{/each}}
        </main>
    </div>
</body>
</html>
```

### 页面模板

页面模板对应网站的不同页面，每个页面模板通常包含多个组件组合。

**位置**: `templates/pages/`

**主要页面**:
- `page.hbs` - 通用页面模板（默认/回退模板；普通页面常用）
- `bookmarks.hbs` - 书签页
- `projects.hbs` - 项目页
- `articles.hbs` - 文章页
- `search-results.hbs` - 搜索结果
- 其他自定义页面

> 说明：MeNav 不再依赖 `home.hbs` 作为首页模板。
> “首页/默认打开页”由 `site.yml -> navigation` 的**第一项**决定；首页可使用任意页面模板，具体取决于该页面配置（`pages/<homePageId>.yml` 的 `template` 字段与回退规则）。

**示例** (`page.hbs`):
```handlebars
<div class="page-template page-template-{{pageId}}">
    {{> page-header}}
    {{#each categories}}
        {{> category}}
    {{/each}}
</div>
```

### 组件模板

组件是可复用的UI元素，用于在不同页面中重复使用。

**位置**: `templates/components/`

> 说明：生成器启动时会自动扫描 `templates/components/` 下的所有 `.hbs` 并注册为 Handlebars partial（partial 名称=文件名去掉 `.hbs`）。因此新增组件后无需手动“注册步骤”，可直接通过 `{{> component-name}}` 引用。

**主要组件**:
- `page-header.hbs` - 统一页面标题区（首页/非首页/书签更新时间/项目热力图）
- `navigation.hbs` - 导航菜单
- `site-card.hbs` - 站点卡片
- `category.hbs` - 分类容器（支持多层级嵌套）
- `group.hbs` - 分组容器（支持多层级嵌套）
- `social-links.hbs` - 社交链接

**示例** (`site-card.hbs`，精简展示关键结构):
```handlebars
{{#if url}}
<a href="{{url}}"
   class="site-card{{#if style}} site-card-{{style}}{{/if}}"
   {{#if external}}target="_blank" rel="noopener"{{/if}}
   data-type="{{#if type}}{{type}}{{else}}site{{/if}}"
   data-name="{{name}}"
   data-url="{{url}}">
    <div class="site-card-icon">...</div>
    <div class="site-card-content">
        <h3>{{#if name}}{{name}}{{else}}未命名站点{{/if}}</h3>
        <p>{{description}}</p>
    </div>
</a>
{{/if}}
```

说明：
- `type=article`：用于 articles Phase 2 的只读文章条目卡片（仍保留 `data-*` 结构；扩展解析应以 `data-type="article"` 区分类型）
- `style=repo`：用于 projects 的代码仓库风卡片（展示 language/stars/forks 等只读元信息）

### 多层级嵌套模板组件

#### category.hbs - 分类容器组件

`category.hbs` 是多层级嵌套的核心组件，可渲染 `categories -> subcategories -> groups -> sites` 的结构；更深一层的 `subgroups` 由 `group.hbs` 负责渲染。

**功能特性**:
- 支持 2~4 层嵌套（`categories -> subcategories -> groups -> subgroups -> sites`，其中 `subgroups` 可选）
- 自动计算标题层级（h2/h3/h4/h5）
- 根据层级自动应用对应的 CSS 类（如 `category-level-2`、`group-level-4`）
- 分类容器支持三种内容：子分类、分组、站点（分组内可继续包含子分组）

**递归渲染原理**:
通过在模板内部调用自身实现递归渲染：
```handlebars
{{#each subcategories}}
    {{> category level=2}}
{{/each}}
```

**level参数的作用**:
- 用于跟踪当前嵌套层级
- 控制标题标签的层级（h{{add level 1}}）
- 应用对应的CSS类（category-level-{{level}}）
- 传递给子组件以保持层级一致性

**使用示例**:
```handlebars
<!-- 顶级分类 -->
{{> category category}}

<!-- 指定层级的分类 -->
{{> category category level=2}}
```

#### group.hbs - 分组容器组件

`group.hbs` 是用于在分类内组织站点的组件，同样支持层级参数。

**功能特性**:
- 支持在分类内创建站点分组
- 支持子分组（`subgroups`，用于第 4 层结构）
- 自动应用层级样式
- 支持展开/折叠功能
- 与category.hbs保持一致的层级系统

**使用示例**:
```handlebars
<!-- 在分类模板中使用 -->
{{#each groups}}
    {{> group}}
{{/each}}

<!-- 指定层级的分组 -->
{{> group group level=3}}
```

#### 多层级嵌套结构示例

典型的（最多 4 层）结构：分类 → 子分类 → 分组 → 子分组 → 站点（`subgroups` 可选）

```yaml
# 配置示例
categories:
  - name: "技术"
    icon: "fas fa-code"
    subcategories:
      - name: "前端开发"
        icon: "fas fa-laptop-code"
        groups:
          - name: "框架"
            icon: "fas fa-cubes"
            subgroups:
              - name: "React生态"
                icon: "fab fa-react"
                sites:
                  - name: "React"
                    url: "https://reactjs.org"
                    icon: "fab fa-react"
                  - name: "Next.js"
                    url: "https://nextjs.org"
                    icon: "fas fa-triangle"
```

对应的模板渲染：
```handlebars
<!-- category.hbs 会递归渲染 -->
<section class="category category-level-1" data-level="1">
  <div class="category-header">
    <h2><i class="fas fa-code"></i> 技术</h2>
  </div>
  <div class="category-content">
    <div class="subcategories-container">
      <!-- 递归调用 category.hbs，level=2 -->
      <section class="category category-level-2" data-level="2">
        <div class="category-header">
          <h3><i class="fas fa-laptop-code"></i> 前端开发</h3>
        </div>
	        <div class="category-content">
	          <div class="groups-container">
	            <!-- 使用 group.hbs，默认 level=3 -->
	            <div class="group group-level-3" data-level="3">
	              <div class="group-header">
	                <h4><i class="fas fa-cubes"></i> 框架</h4>
	              </div>
	              <div class="group-content">
	                <div class="subgroups-container">
	                  <!-- group.hbs 渲染 subgroups，level=4 -->
	                  <div class="group group-level-4" data-level="4">
	                    <div class="group-header">
	                      <h5><i class="fab fa-react"></i> React生态</h5>
	                    </div>
	                    <div class="group-content">
	                      <div class="sites-grid">
	                        <!-- 渲染站点卡片 -->
	                        {{> site-card site}}
	                      </div>
	                    </div>
	                  </div>
	                </div>
	              </div>
	            </div>
	          </div>
	        </div>
      </section>
    </div>
  </div>
</section>
```

#### 层级系统说明

- **层级1 (level=1)**: 顶级分类，使用h2标题
- **层级2 (level=2)**: 子分类，使用h3标题
- **层级3 (level=3)**: 分组，使用h4标题
- **层级4 (level=4)**: 子分组，使用h5标题（用于 4 层结构）

每个层级都有对应的CSS类：
- `category-level-1`, `category-level-2`
- `group-level-3`, `group-level-4`

这种设计确保了：
1. 语义化的HTML结构
2. 一致的视觉层级
3. 可预测的嵌套深度（当前导入脚本与样式保证到 level=4）
4. 灵活的样式定制

### 站点图标渲染（favicon/manual）

当启用 `icons.mode: favicon`（默认）时，站点卡片会优先显示站点 favicon；当 URL 非 http/https、加载失败或网络受限，则自动回退到 Font Awesome 图标。相关助手：`ifHttpUrl`（条件）与 `encodeURIComponent`（工具）。

示例（与内置组件实现保持一致）：

```handlebars
{{#if url}}
<a href="{{url}}" class="site-card{{#if style}} site-card-{{style}}{{/if}}"
   {{#if external}}target="_blank" rel="noopener"{{/if}}
   data-type="site"
   data-name="{{name}}"
   data-url="{{url}}"
   data-icon="{{#if icon}}{{icon}}{{else}}fas fa-link{{/if}}"
   data-description="{{#if description}}{{description}}{{else}}{{extractDomain url}}{{/if}}">
    {{#ifEquals @root.icons.mode "favicon"}}
      {{#ifHttpUrl url}}
        <div class="icon-container">
          <i class="fas fa-circle-notch fa-spin icon-placeholder" aria-hidden="true"></i>
          <img
            class="favicon-icon"
            src="https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url={{encodeURIComponent url}}&size=32"
            alt="{{name}} favicon"
            loading="lazy"
            onload="this.classList.add('loaded'); this.previousElementSibling.classList.add('hidden');"
            onerror="this.classList.add('error'); this.previousElementSibling.classList.add('hidden'); this.nextElementSibling.classList.add('visible');"
          />
          <i class="fas fa-link icon-fallback" aria-hidden="true"></i>
        </div>
      {{else}}
        <i class="{{#if icon}}{{icon}}{{else}}fas fa-link{{/if}}"></i>
      {{/ifHttpUrl}}
    {{else}}
      <i class="{{#if icon}}{{icon}}{{else}}fas fa-link{{/if}}"></i>
    {{/ifEquals}}
    <h3>{{#if name}}{{name}}{{else}}未命名站点{{/if}}</h3>
    <p>{{#if description}}{{description}}{{else}}{{extractDomain url}}{{/if}}</p>
</a>
{{/if}}
```

提示：关于 `icons.mode` 的配置与隐私说明，请参见：
- `config/README.md` 的 `site.yml 常用字段`：[`../config/README.md#siteyml-常用字段`](../config/README.md#siteyml-%E5%B8%B8%E7%94%A8%E5%AD%97%E6%AE%B5)
- 根目录 `README.md` 的“近期更新”：[`../README.md#近期更新`](../README.md#%E8%BF%91%E6%9C%9F%E6%9B%B4%E6%96%B0)

## 模板数据流

MeNav 模板系统的数据流如下：

1. `generator.js` 加载配置文件并处理数据
2. 数据通过 Handlebars 上下文传递给模板
3. 布局模板 (`layouts/default.hbs`) 作为外层容器
4. 页面模板 (`pages/*.hbs`) 填充布局中的内容区域
5. 组件模板 (`components/*.hbs`) 在页面中通过 `{{> component-name}}` 引用

主要数据对象:
- `site` - 网站配置信息
- `navigationData` - 导航菜单数据
- `categories` - 分类和站点数据
- `profile` - 个人资料数据
- `social` - 社交链接数据

常见派生字段（由生成器注入，供模板差异化使用）：
- `homePageId`：首页页面 ID（始终等于 `navigation` 第一项的 `id`）
- `pageId`：当前页面 ID（用于 `.page-template-{{pageId}}` 等）
- `pageMeta.updatedAt/updatedAtSource`：仅 bookmarks 模板页用于“update: YYYY-MM-DD | from: ...”展示
- `projectsMeta.heatmap`：仅 projects 模板页用于右侧 GitHub 热力图展示（需要配置 `site.github.username`）
- `articlesItems/articlesCategories`：仅 articles 模板页（Phase 2）用于渲染只读文章条目（RSS 缓存存在时）

> 提示：页面模板是“页面内容片段”，不要包含 `<!DOCTYPE html>` 等整页骨架；整页骨架由 `layouts/default.hbs` 负责。

## 模板使用示例

### 布局模板使用
布局模板通常只有一个 `default.hbs`，会自动被系统使用。

### 页面模板使用
页面模板对应导航中的各个页面，有两种使用方式：

1. **自动匹配**：系统会尝试使用与页面ID同名的模板（例如：页面ID为 `projects` 时会使用 `projects.hbs`）
2. **显式指定**：在页面配置中使用 `template` 字段指定要使用的模板

#### 模板指定示例
在 `config/user/pages/项目.yml` 中：

```yaml
title: "我的项目"
subtitle: "这里展示我的所有项目"
template: "projects" # 使用 projects.hbs 模板而不是使用页面ID命名的模板
categories:
  - name: "网站项目"
    icon: "fas fa-globe"
    sites:
      - name: "个人博客"
        # ... 其他字段
```

**注意**：当系统找不到指定的模板或与页面ID匹配的模板时，会自动使用通用模板 `page.hbs`。

### 引用组件

在页面或其他组件中引用组件：

```handlebars
{{> navigation navigationData}}
{{> site-card}}
```

### 条件渲染

根据条件显示内容：

```handlebars
{{#if profile.title}}
    <h2>{{profile.title}}</h2>
{{else}}
    <h2>欢迎使用</h2>
{{/if}}
```

### 循环渲染

循环渲染数据列表：

```handlebars
{{#each categories}}
    <section class="category" id="{{name}}">
        <h2><i class="{{icon}}"></i> {{name}}</h2>
        <div class="sites-grid">
            {{#each sites}}
                {{> site-card}}
            {{/each}}
        </div>
    </section>
{{/each}}
```

## 最佳实践

1. **组件粒度** - 保持组件的适当粒度，既不过大也不过小
   - 过大：难以复用和维护
   - 过小：增加复杂性和引用管理难度

2. **数据传递** - 使用合适的方式传递数据
   - 直接上下文：`{{> component}}` (继承父上下文)
   - 指定数据：`{{> component customData}}` (传递特定数据)

3. **命名规范**
   - 使用连字符命名：`site-card.hbs`、`search-results.hbs`
   - 使用描述性名称，体现组件用途

4. **注释**
   - 对复杂逻辑添加注释说明
   - 标注可选参数和默认行为

## 扩展指南

### 添加新页面

1. 在 `templates/pages/` 创建新的 `.hbs` 文件
2. 在 `config/user/site.yml` 的 `navigation` 部分添加页面配置（配置采用“完全替换”策略，推荐使用 user 配置）
3. 页面内容可引用现有组件或创建新组件

示例：
```handlebars
<!-- templates/pages/about.hbs -->
<div class="about-page">
    <h2>关于我</h2>
    <p>{{about.description}}</p>
    
    {{#if about.skills}}
    <div class="skills">
        <h3>技能</h3>
        <ul>
            {{#each about.skills}}
            <li>{{this}}</li>
            {{/each}}
        </ul>
    </div>
    {{/if}}
</div>
```

### 添加新组件

1. 在 `templates/components/` 创建新的 `.hbs` 文件
2. 在页面或其他组件中引用

示例：
```handlebars
<!-- templates/components/skill-card.hbs -->
<div class="skill-card">
    <h4>{{name}}</h4>
    <div class="skill-level" data-level="{{level}}">
        <div class="skill-bar" style="width: {{level}}%"></div>
    </div>
</div>
```

使用新组件：
```handlebars
{{#each skills}}
    {{> skill-card}}
{{/each}}
```
