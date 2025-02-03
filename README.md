# MeNav - 个人导航站

一个个人导航网站，帮助你整理和展示你的网络收藏。

## 在线预览

访问：[https://rzlnb.github.io/menav/](https://rzlnb.github.io/menav/)

## 功能特点

- 🎨 简洁美观的界面设计
- 📱 响应式布局，支持移动端
- 🔍 实时搜索功能
- 🎯 分类展示网站链接
- 👥 支持展示社交媒体链接
- 📝 支持多个内容页面（首页、项目、文章、友链）

## 技术栈

- HTML5 + CSS3
- JavaScript (原生)
- Font Awesome 图标
- GitHub Pages / Cloudflare Pages 托管

## 快速开始

1. 克隆仓库
```bash
git clone https://github.com/RZLNB/menav.git
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
编辑 `config.yml` 文件，根据你的需求修改网站内容：
- 修改网站基本信息
- 添加/修改导航链接
- 自定义社交媒体链接
- 更新个人项目展示
- 添加友情链接等

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
   - 复制 `config.yml` 为 `config.user.yml`
   - 在 `config.user.yml` 中修改配置
   - 这样在后续同步更新时,您的配置不会被覆盖

2. 修改配置信息:
   - 修改网站基本信息
   - 添加/修改导航链接
   - 自定义社交媒体链接
   - 更新个人项目展示
   - 添加友情链接等

完成以上步骤后,系统会自动部署您的网站。部署完成后,您可以在 Settings -> Pages 中找到您的网站地址。

> 重要提示: 请务必使用 `config.user.yml` 进行配置,这样在同步上游更新时不会丢失您的个人设置。

#### 故障排除

如果遇到部署问题:
1. 请确保完成了所有前置设置步骤
2. 检查每个设置页面是否都点击了 Save 按钮
3. 如果修改设置后部署仍然失败:
   - 进入 Actions 标签页
   - 找到失败的工作流
   - 点击 "Re-run all jobs" 重新运行

### 高级部署选项：Cloudflare Pages

如果您需要更好的访问速度或私有仓库支持,可以选择使用Cloudflare Pages部署:

1. 在 [Cloudflare Dashboard](https://dash.cloudflare.com) 中创建新项目
2. 连接您的GitHub仓库
3. 使用以下构建配置:
   - 构建命令: `npm run generate`
   - 构建输出目录: `/`
   - Node.js 版本: `16`或更高

## 自定义配置

### 配置文件说明

本项目提供两种配置文件:
1. `config.yml` - 默认配置模板,会随项目更新
2. `config.user.yml` - 用户个人配置,不会被项目更新覆盖

建议使用步骤:
1. 复制 `config.yml` 为 `config.user.yml`
2. 在 `config.user.yml` 中进行个性化配置
3. 原始的 `config.yml` 保持不变
4. 后续同步更新时,您的个人配置不会被覆盖

> 注意: `config.user.yml` 已添加到 .gitignore 中,不会被提交到仓库

### 配置文件结构

`config.yml` 包含以下主要部分：

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
    family: 字体名称  # 可以是Web安全字体或Google Fonts
    weight: 字重值  # 如400、500、600等
    source: 字体来源  # "google"或"system"
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

# 更多配置...
```

### 设置网站字体

1. 字体配置选项:
   - `family`: 字体名称，支持Web安全字体或Google Fonts
   - `weight`: 字体粗细，常用值如400(常规)、500(中等)、600(粗体)等
   - `source`: 字体来源，可选"google"或"system"
   
2. 字体分类:
   - `title`: 标题字体，用于大标题
   - `subtitle`: 副标题字体，用于副标题
   - `body`: 正文字体，用于普通文本

3. 使用Google字体示例:
```yaml
fonts:
  body:
    family: "Noto Sans SC"  # Google提供的中文字体
    weight: 400
    source: "google"
```

4. 使用系统字体示例:
```yaml
fonts:
  body:
    family: "Segoe UI, system-ui, -apple-system, sans-serif"
    weight: 400
    source: "system"
```

### 设置网站图标

1. 准备图标文件:
   - 支持.ico、.png等格式
   - 建议尺寸为32x32或16x16像素
   - 将图标文件放在仓库根目录
   - 例如: `favicon.ico` 或 `favicon.png`

2. 配置图标:
   - 在`config.yml`或`config.user.yml`的site部分设置favicon
   - 使用相对于仓库根目录的路径
   - 例如: `favicon: favicon.ico`
   - 也可以使用在线图标URL

3. 生成和部署:
   - 运行 `npm run generate` 时会自动复制图标文件
   - 确保图标文件存在于指定位置
   - 部署后图标会自动显示在浏览器标签页

> 提示: 如果图标没有显示,请检查:
> 1. 图标文件是否存在于正确位置
> 2. 配置文件中的路径是否正确
> 3. 是否重新运行了生成命令

### 添加新的网站链接

在 `config.yml` 中相应的分类下添加新站点：

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

## 版本

当前版本: v1.2.3

查看 [CHANGELOG.md](./CHANGELOG.md) 了解详细的更新历史。

## 贡献

欢迎提交 Issue 和 Pull Request 来帮助改进这个项目。

## 许可证

MIT License 
