# MeNav - 个人导航站

一个简洁美观的个人导航网站，帮助你整理和展示你的网络收藏。

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

1. 点击右上角的 Fork 按钮复制此仓库到您的账号
2. 修改 `config.yml` 中的配置信息
3. 在仓库设置中启用 GitHub Pages:
   - 进入仓库的 Settings -> Pages
   - 在 "Source" 下拉菜单中选择 "GitHub Actions"
   - 点击 Save

完成以上步骤后,系统会自动部署您的网站。部署完成后,您可以在 Settings -> Pages 中找到您的网站地址。

> 提示：首次fork后,系统会自动创建一个部署指南issue,您可以按照指南完成部署。

### 高级部署选项：Cloudflare Pages

如果您需要更好的访问速度或私有仓库支持,可以选择使用Cloudflare Pages部署:

1. 在 [Cloudflare Dashboard](https://dash.cloudflare.com) 中创建新项目
2. 连接您的GitHub仓库
3. 使用以下构建配置:
   - 构建命令: `npm run generate`
   - 构建输出目录: `/`
   - Node.js 版本: `16`或更高

## 自定义配置

### 配置文件结构

`config.yml` 包含以下主要部分：

```yaml
# 网站基本信息
site:
  title: 网站标题
  description: 网站描述
  author: 作者名

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