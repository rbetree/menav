# MeNav 资源目录

## 目录

- [目录概述](#目录概述)
- [资源列表](#资源列表)
- [CSS 模块化架构](#css-模块化架构)
- [添加新资源](#添加新资源)

## 目录概述

`assets` 目录包含 MeNav 项目所需的所有静态资源文件，包括样式表、图标、图片等。这些资源文件直接被复制到生成的站点中，用于网站的展示和功能实现。

## 资源列表

目录包含以下主要资源：

- **style.css**: 样式入口文件
  - 通过 `@import` 聚合所有模块化 CSS
  - 构建时由 esbuild 合并压缩为单文件

- **styles/**: CSS 模块目录（详见下方）

- **menav.svg**: 网站图标和项目logo
  - 显示在浏览器标签页、书签和收藏夹中
  - SVG格式，包含黑色字母"M"和蓝色向上箭头设计

- **preview_light.png / preview_dark.png**: 主题预览图
  - 用于 README 文档展示

## CSS 模块化架构

样式采用模块化组织，构建时自动合并：

```
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
    ├── _modal.css         # 模态框、表单
    ├── _content.css       # Markdown 内容页
    ├── _dashboard.css     # 仪表盘（时钟/Todo）
    └── _main.css          # 兜底样式（分类、热力图、响应式）
```

### 模块说明

| 模块 | 职责 |
|------|------|
| `tokens.css` | 尺寸、字体、间距、圆角、动效、半透明面与派生交互 token |
| `themes.css` | 默认深色主题、Notion 风格浅色主题、主题色阶覆盖 |
| `base.css` | 基础层聚合入口，导入 `_base.css` 与 `_animations.css` |
| `layout.css` | 布局层聚合入口，导入 `_layout.css` |
| `components.css` | 组件层聚合入口，导入侧边栏、搜索、卡片、表单、内容、仪表盘样式 |
| `utilities.css` | 工具/兜底层聚合入口，导入 `_main.css` |
| `_variables.css` | 旧变量入口兼容层，新代码不要继续扩展该文件 |
| `_base.css` | 全局重置、滚动条、遮罩层、主题切换按钮 |
| `_animations.css` | 所有 `@keyframes` 定义 |
| `_layout.css` | 页面容器、欢迎区域、模板布局 |
| `_sidebar.css` | 侧边栏、导航项、折叠状态、子菜单 |
| `_search.css` | 搜索框、引擎下拉、快捷键提示 |
| `_cards.css` | 站点卡片、网格布局、tooltip、编辑按钮 |
| `_modal.css` | 模态框、表单控件、按钮样式 |
| `_content.css` | Markdown 渲染（标题、代码块、表格等） |
| `_dashboard.css` | 仪表盘网格、时钟卡片、Todo 列表 |
| `_main.css` | 分类层级、GitHub 热力图、全局响应式 |

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
