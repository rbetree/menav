# MeNav 模板目录

## 目录

- [模板系统概述](#模板系统概述)
- [目录结构](#目录结构)
- [模板类型](#模板类型)
  - [布局模板](#布局模板)
  - [页面模板](#页面模板)
  - [组件模板](#组件模板)
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
│   ├── home.hbs      # 首页
│   ├── bookmarks.hbs # 书签页
│   └── ...
├── components/   # 组件模板 - 可复用的界面元素
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
- `home.hbs` - 首页
- `bookmarks.hbs` - 书签页
- `search-results.hbs` - 搜索结果
- 其他自定义页面

**示例** (`home.hbs`):
```handlebars
<div class="welcome-section">
    <h2>{{profile.title}}</h2>
    <h3>{{profile.subtitle}}</h3>
    <p class="subtitle">{{profile.description}}</p>
</div>
{{#each categories}}
    {{> category}}
{{/each}}
```

### 组件模板

组件是可复用的UI元素，用于在不同页面中重复使用。

**位置**: `templates/components/`

**主要组件**:
- `navigation.hbs` - 导航菜单
- `site-card.hbs` - 站点卡片
- `category.hbs` - 分类容器
- `social-links.hbs` - 社交链接
- `search-results.hbs` - 搜索结果展示

**示例** (`site-card.hbs`):
```handlebars
{{#if url}}
<a href="{{url}}" class="site-card{{#if style}} site-card-{{style}}{{/if}}" title="{{name}} - {{description}}" {{#if external}}target="_blank" rel="noopener"{{/if}}>
    <i class="{{#if icon}}{{icon}}{{else}}fas fa-link{{/if}}"></i>
    <h3>{{#if name}}{{name}}{{else}}未命名站点{{/if}}</h3>
    <p>{{description}}</p>
</a>
{{/if}}
```

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
2. 在 `config/_default/navigation.yml` 添加页面配置
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
