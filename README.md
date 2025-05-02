# <img src="assets/favicon.ico" width="48" style="vertical-align: middle;"> MeNav - 个人导航站

一键部署的静态个人导航站 | 自动化构建 | 支持书签导入

如果觉得项目有用，欢迎⭐Star/Fork支持，谢谢！

## 目录

- [在线预览](#在线预览)
- [功能特点](#功能特点)
- [近期更新](#近期更新)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [部署方式](#部署方式)
  - [快速部署到GitHub Pages](#快速部署到github-pages)
  - [部署到服务器](#部署到服务器)
- [设置配置文件](#设置配置文件)
  - [使用单文件配置](#使用单文件配置)
  - [使用模块化配置](#使用模块化配置)
- [书签导入功能](#书签导入功能)
- [贡献](#贡献)
- [许可证](#许可证)

## 在线预览

访问：[在线DEMO](https://rbetree.github.io/menav/)

## 功能特点

- 🎨 简洁美观的界面设计
- 📱 响应式布局，支持移动端
- 🔍 实时搜索功能
- 🎯 分类展示网站链接
- 👥 支持展示社交媒体链接
- 📝 支持多个内容页面（首页、项目、文章、友链）
- 📌 支持从浏览器导入书签
- 🧩 模块化配置/单文件配置
- 🔄 可部署到GitHub Pages或任何服务器

## 近期更新

<details>
<summary>点击查看/隐藏更新日志</summary>

### 2025/05/03

**1. 侧边栏收回功能**
- ✅ 添加侧边栏折叠/展开按钮，位于Logo文本右侧
- ✅ 侧边栏平滑折叠/展开过渡

**2. 移动端UI优化**
- ✅ 修复搜索按钮和侧边栏按钮遮挡问题
- ✅ 点击侧边栏导航项后自动收起侧边栏


### 2025/05/02

**1. 模块化配置**
- ✅ 支持将配置拆分为多个文件，便于管理和维护
- ✅ 引入配置目录结构，分离页面配置
- ✅ 保持向后兼容性，同时支持传统配置文件

### 2025/05/01

**1. 页面布局优化**
- ✅ 优化了内容区域和侧边栏的间距，确保各种分辨率下内容不会贴近边缘
- ✅ 卡片与边框始终保持合理间距，避免在窄屏设备上与滚动条贴边
- ✅ 调整了搜索结果区域的边距，与常规分类保持样式一致性

**2. 网站卡片文本优化**
- ✅ 为站点卡片标题添加单行文本截断，过长标题显示省略号
- ✅ 为站点描述添加两行限制和省略号，保持卡片布局整洁
- ✅ 添加卡片悬停提示，方便查看完整信息

**3. 移动端显示增强**
- ✅ 优化了移动端卡片尺寸，一屏可显示更多网址
- ✅ 图标大小自适应，在小屏幕上更加紧凑
- ✅ 为不同尺寸移动设备（768px、480px、400px）提供递进式UI优化
- ✅ 减小卡片内边距和元素间距，增加屏幕利用率

**4. 书签导入功能**
- ✅ 支持从Chrome、Firefox和Edge浏览器导入HTML格式书签
- ✅ 自动处理书签文件，解析文件夹结构和链接
- ✅ 智能匹配网站图标，根据URL自动分配合适的Font Awesome图标
- ✅ 生成配置文件，无需手动录入即可批量导入网站链接
- ✅ 与GitHub Actions集成，全自动化的导入和部署流程

</details>

## 技术栈

- HTML5 + CSS3
- JavaScript (原生)
- Font Awesome 图标
- GitHub Pages托管

## 项目结构

```
menav/
├── assets/           # 静态资源文件
│   ├── style.css     # 样式表
│   └── favicon.ico   # 网站图标
├── src/              # 源代码
│   ├── generator.js  # 静态网站生成器
│   └── script.js     # 前端JavaScript脚本
├── templates/        # HTML模板
│   └── index.html    # HTML骨架模板文件
├── dist/             # 生成的静态网站（由generator.js生成）
├── bookmarks/        # 书签导入目录
├── config/           # 模块化配置目录
│   ├── _default/     # 默认配置
│   │   ├── site.yml  # 网站基本配置
│   │   ├── navigation.yml # 导航配置
│   │   └── pages/    # 页面配置
│   │       ├── home.yml
│   │       ├── projects.yml
│   │       ├── articles.yml
│   │       ├── friends.yml
│   │       └── bookmarks.yml
│   └── user/         # 用户自定义配置
│       ├── site.yml  # 用户网站配置
│       ├── navigation.yml # 用户导航配置 
│       └── pages/    # 用户页面配置
├── config.yml        # 默认配置文件（传统格式）
└── config.user.yml   # 用户自定义配置文件（传统格式）
```

## 快速开始

1. 克隆仓库
```bash
git clone https://github.com/rbetree/menav.git
cd menav
```

2. 安装依赖
```bash
# 清理旧的依赖(如果需要)
rm -rf node_modules
rm -f package-lock.json

# 安装新的依赖
npm install
```

3. 修改配置
   - 可以选择使用单文件配置或模块化配置（见[设置配置文件](#设置配置文件)）
   - 自定义网站内容、导航链接、社交媒体链接等

4. 本地预览
```bash
npm run dev
```

## 部署方式

### 快速部署到GitHub Pages

#### 第一步：前置设置

1. Fork仓库:
   - 点击右上角的 Fork 按钮复制此仓库到您的账号

2. 启用必要功能:
   - 进入仓库的 Settings -> General
   - 找到 Features 部分
   - 勾选 "Issues"

3. 启用Actions:
   - 进入fork后的仓库
   - 点击顶部的 "Actions" 标签页
   - 点击绿色按钮 "I understand my workflows, go ahead and enable them"

4. 配置Pages:
   - 进入仓库的 Settings -> Pages
   - 在 "Build and deployment" 部分
   - Source: 选择 "GitHub Actions"

#### 第二步：自定义配置

1. 创建个人配置文件:
   - 可以使用单文件配置或模块化配置
   - 推荐使用模块化配置（见[使用模块化配置](#使用模块化配置)）
   - 提交您的配置文件到仓库

2. 等待自动部署:
   - GitHub Actions会自动检测您的更改
   - 构建并部署您的网站
   - 部署完成后，您可以在 Settings -> Pages 中找到您的网站地址

> 重要提示: 请注意不要在配置文件中包含敏感信息，因为它将被提交到公开仓库。

#### 故障排除

如果遇到部署问题:
1. 请确保完成了所有前置设置步骤
2. 检查每个设置页面是否都点击了 Save 按钮
3. 如果修改设置后部署仍然失败:
   - 进入 Actions 标签页
   - 找到失败的工作流
   - 点击 "Re-run all jobs" 重新运行

### 部署到服务器

如果您想部署到自己的Web服务器，只需要以下几个步骤：

1. 构建静态网站:
```bash
npm run build
```

2. 复制构建结果:
   - 所有生成的静态文件都位于 `dist` 目录中
   - 将 `dist` 目录中的所有文件复制到您的Web服务器根目录

3. 配置Web服务器:
   - 确保服务器配置为提供静态文件
   - 对于Apache: 在网站根目录中已有正确的 .htaccess 文件
   - 对于Nginx: 添加以下配置到您的server块:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

4. 更新配置:
   - 如果您想在服务器上更新网站，只需重复上述步骤1-2
   - 或者设置自动部署流程，例如使用GitLab CI/CD或Jenkins

## 设置配置文件

MeNav支持两种配置方式：单文件配置和模块化配置（推荐）。

在加载配置时遵循以下优先级顺序：

1. `config/user/` （模块化用户配置）
2. `config.user.yml`（单文件用户配置）
3. `config/_default/` （模块化默认配置）
4. `config.yml`（单文件默认配置）

### 使用单文件配置

单文件配置是最简单的配置方式，适合小型网站和快速开始。

1. **创建配置文件**:
   - 复制 `config.yml` 为 `config.user.yml`
   - 编辑 `config.user.yml` 文件

2. **配置文件结构**:
```yaml
# 网站基本信息
site:
  title: 网站标题
  description: 网站描述
  author: 作者名
  favicon: favicon.ico  # 网站图标,支持ico、png等格式

# 字体设置
fonts:
  title:  # 标题字体
    family: 字体名称
    weight: 字重值
    source: 字体来源
  subtitle:  # 副标题字体
    family: 字体名称
    weight: 字重值
    source: 字体来源
  body:  # 正文字体
    family: 字体名称
    weight: 字重值
    source: 字体来源

# 个人信息
profile:
  title: 欢迎语
  subtitle: 副标题
  description: 描述

# 导航菜单
navigation:
  - name: 菜单名称
    icon: 图标类名
    id: 页面ID
    active: 是否激活

# 类别
categories:
  - name: 分类名称
    icon: 分类图标
    sites:
      - name: 网站名称
        url: 网站地址
        icon: 网站图标
        description: 网站描述

# 更多配置...
```

3. **添加网站链接**:
   在 `config.user.yml` 中的 categories 部分添加新站点：
```yaml
categories:
  - name: 分类名称
    icon: 分类图标
    sites:
      - name: 网站名称
        url: 网站地址
        icon: 网站图标
        description: 网站描述
```

4. **设置网站字体**:
   - `family`: 字体名称，支持Web安全字体或Google Fonts
   - `weight`: 字体粗细，常用值如400(常规)、500(中等)、600(粗体)等
   - `source`: 字体来源，可选"google"或"system"

   例如使用Google字体:
```yaml
fonts:
  body:
    family: "Noto Sans SC"  # Google提供的中文字体
    weight: 400
    source: "google"
```

5. **设置网站图标**:
   - 支持.ico、.png等格式
   - 建议尺寸为32x32或16x16像素
   - 将图标文件放在assets目录下
   - 在配置文件中设置：`favicon: favicon.ico`

### 使用模块化配置

模块化配置将配置分散到多个文件中，更易于管理和维护，推荐用于复杂网站。

#### 模块化配置目录结构

```
config/
├── _default/           # 默认配置
│   ├── site.yml        # 网站基本信息、字体等
│   ├── navigation.yml  # 导航菜单配置
│   └── pages/          # 页面配置
│       ├── home.yml    # 首页配置
│       ├── projects.yml # 项目页配置
│       ├── articles.yml # 文章页配置
│       ├── friends.yml  # 朋友页配置
│       └── bookmarks.yml # 书签页配置
└── user/               # 用户自定义配置（可选覆盖）
    ├── site.yml        # 用户网站配置
    ├── navigation.yml  # 用户导航配置
    └── pages/          # 用户页面配置
        ├── home.yml    # 用户首页配置
        # 其他用户自定义页面...
```

#### 使用模块化配置的优势

1. **分离关注点**：每个页面和功能区域有专属配置文件
2. **简化编辑**：修改特定页面时只需编辑对应文件
3. **更好的版本控制**：减少合并冲突
4. **向后兼容**：仍然支持传统的 `config.yml` 和 `config.user.yml`


## 书签导入功能

MeNav支持从浏览器导入书签，快速批量添加网站链接。

### 导入步骤

1. **从浏览器导出书签**
   - 在Chrome中: 打开书签管理器 -> 点击"更多"(三个点) -> 导出书签
   - 在Firefox中: 打开书签库 -> 显示所有书签 -> 导入和备份 -> 导出书签为HTML
   - 在Edge中: 设置 -> 收藏夹 -> 管理收藏夹 -> 导出为HTML文件

2. **导入书签到MeNav**
   - 在项目根目录下创建 `bookmarks` 文件夹(如果不存在)
   - 将导出的HTML书签文件放入 `bookmarks` 文件夹
   - 提交并推送变更到仓库
   - 系统会自动处理书签文件并生成配置文件

3. **书签处理结果**
   - 生成的书签配置会保存到 `bookmarks.user.yml`
   - 如果使用模块化配置，也会同时保存到 `config/user/pages/bookmarks.yml`
   - 书签会自动添加到导航菜单中

> 有关书签导入功能的更多信息，请参阅源代码中的相关注释。

## 贡献

欢迎通过 Issues 或 Pull Requests 的形式做出贡献。如果您有好的想法或发现了问题，请随时提出。

## 许可证

AGPL-3.0 License

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program requires that modified versions must also be made available under the same license when used over a network. 
