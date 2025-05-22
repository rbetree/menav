# MeNav 配置目录

## 目录

- [目录概述](#目录概述)
- [配置目录结构](#配置目录结构)
- [配置加载机制](#配置加载机制)
- [模块化配置文件](#模块化配置文件)
  - [网站基础配置](#网站基础配置)
  - [导航配置](#导航配置)
  - [页面配置](#页面配置)
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
│   ├── site.yml        # 默认网站基础配置
│   ├── navigation.yml  # 默认导航配置
│   └── pages/          # 默认页面配置
│       ├── home.yml    # 首页默认配置
│       ├── projects.yml
│       ├── articles.yml
│       ├── friends.yml
│       └── bookmarks.yml
└── user/               # 用户配置目录（覆盖默认配置）
    ├── site.yml        # 用户自定义网站配置
    ├── navigation.yml  # 用户自定义导航配置
    └── pages/          # 用户自定义页面配置
        ├── home.yml    # 首页用户配置
        └── ...
```

## 配置加载机制

MeNav 配置系统使用深度合并机制，按以下顺序加载和合并配置：

1. 加载 `_default` 目录中的所有配置（基础层）
2. 加载 `user` 目录中的配置（如果存在，覆盖同名配置项）
3. 深度合并所有配置，确保用户配置优先级高于默认配置
4. 应用最终合并后的配置生成网站

这种机制使用户只需配置想要自定义的部分，其余部分由默认配置提供。

## 模块化配置文件

### 网站基础配置

`site.yml` 定义网站的基本信息和全局设置：

- 网站标题、描述和关键词
- 作者信息和版权声明
- 字体配置和主题设置
- 全局元数据和站点参数
- 个人资料和社交媒体链接

### 导航配置

`navigation.yml` 定义网站的导航结构：

- 侧边栏导航项
- 页面标题和图标
- 页面顺序和可见性
- 外部链接配置

### 页面配置

`pages/` 目录下的配置文件定义各个页面的内容：

- `home.yml`: 首页分类和站点列表
- `projects.yml`: 项目展示配置
- `articles.yml`: 文章列表配置
- `friends.yml`: 友情链接配置
- `bookmarks.yml`: 书签页面配置
- 自定义页面配置

## 配置优先级

配置项的优先级从高到低为：

1. 用户页面配置 (`user/pages/*.yml`)
2. 用户导航配置 (`user/navigation.yml`)
3. 用户网站配置 (`user/site.yml`)
4. 默认页面配置 (`_default/pages/*.yml`)
5. 默认导航配置 (`_default/navigation.yml`)
6. 默认网站配置 (`_default/site.yml`)

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
  description: "这是一个用于快速访问常用网站的个人导航页面。"

# 主题和样式设置
theme:
  default: "light"
  toggleIcon: true
  
# 字体配置
fonts:
  title: "Roboto, sans-serif"
  content: "Noto Sans SC, sans-serif"
  
# 社交媒体链接
social:
  - name: "GitHub"
    url: "https://github.com/username"
    icon: "fab fa-github"
  - name: "Twitter"
    url: "https://twitter.com/username"
    icon: "fab fa-twitter"
```

### 首页配置示例 (home.yml)

```yaml
# 首页分类配置
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
   - 只覆盖需要自定义的配置项
   - 定期备份您的用户配置

4. **配置验证**:
   - 修改配置后先在本地构建测试
   - 使用 `npm run dev` 预览更改效果
   - 确保 YAML 语法正确无误 