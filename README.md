<div align="center">
  <img src="assets/menav.svg" alt="MeNav" width="120">
  <h1>MeNav</h1>
  <p>
    一个轻量的个人导航网站
  </p>
</div>

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0.html)
[![GitHub stars](https://img.shields.io/github/stars/rbetree/menav)](https://github.com/rbetree/menav/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/rbetree/menav)](https://github.com/rbetree/menav/network/members)

📋 静态一键部署 | ⚡ 自动化构建 | 🔖 支持书签导入

> MeNav 是一个轻量级、高度可定制的个人导航网站生成器，让您轻松创建属于自己的导航主页。无需数据库和后端服务，完全静态部署，支持一键 Fork 部署到 GitHub Pages，还可以从浏览器书签一键导入网站。配合 [MarksVault](https://github.com/rbetree/MarksVault) 浏览器扩展，更支持书签自动同步和导航站自动更新。

如果觉得项目有用，欢迎 Star/Fork 支持，谢谢！

[直接开始部署>>](#部署方式)

## 预览

[在线访问](https://rbetree.github.io/menav/)

<p align="center">
  <img src="assets/preview_light.png" alt="明亮主题预览" width="48%">
  <img src="assets/preview_dark.png" alt="黑暗主题预览" width="48%">
</p>

## 特点

- 简洁美观的响应式布局设计
- 集成外部搜索引擎
- 分类展示网站链接
- 模块化配置
- 支持从浏览器导入书签
- 支持2-4层级的多层级嵌套结构
- 与 [MarksVault](https://github.com/rbetree/MarksVault) 浏览器扩展集成，支持自动推送书签
- 可部署到GitHub Pages或任何类似的CI/CD服务

> 历史更新记录已迁移至 [`CHANGELOG.md`](CHANGELOG.md)，README 不再维护该部分。


## 技术栈

- HTML5 + CSS3
- JavaScript (原生)
- Handlebars 模板引擎
- Google Favicon API + Font Awesome 图标

## 项目结构

```text
menav/
├── src/        # 生成器、书签处理、前端脚本（入口：src/generator.js）
├── templates/  # Handlebars 模板（layouts/pages/components）
├── config/     # 模块化配置
├── assets/     # 静态资源
├── bookmarks/  # 书签导入相关
└── dist/       # 构建产物
```

## 文档导航

- 历史更新记录（README 不再维护）：[`CHANGELOG.md`](CHANGELOG.md)
- 更新说明2025/12/27（兼容性移除 / 迁移指南）：[`config/update-instructions-20251227.md`](config/update-instructions-20251227.md)
- 配置系统（完全替换策略、目录结构、示例）：[`config/README.md`](config/README.md)
- 书签导入（格式要求、流程、常见问题）：[`bookmarks/README.md`](bookmarks/README.md)
- 模板系统（组件、回退、数据流）：[`templates/README.md`](templates/README.md)
- 源码结构（各脚本职责）：[`src/README.md`](src/README.md)
- Handlebars helpers（模板辅助函数）：[`src/helpers/README.md`](src/helpers/README.md)
- 静态资源（样式/图片等）：[`assets/README.md`](assets/README.md)

## 快速开始

用于本地开发预览与构建静态站点；在线部署见 [部署方式](#部署方式)。

<details>
<summary>点击展开</summary>

通过以下步骤快速设置您的个人导航站：

1. 克隆仓库

```bash
git clone https://github.com/rbetree/menav.git
cd menav
```

2. 安装依赖

```bash
# 安装依赖
npm install
```

（本仓库的 GitHub Actions/CI 已改为使用 `npm ci`，以获得更稳定、可复现的依赖安装（基于 `package-lock.json`）；本地开发可继续使用 `npm install`，也可直接使用 `npm ci`。）

3. 完成配置（见[设置配置文件](#设置配置文件)）
4. 导入书签（可选）
   - 将浏览器导出的HTML格式书签文件放入`bookmarks`目录
   - 运行书签处理命令：

   ```bash
   npm run import-bookmarks
   ```

   - 若希望生成结果保持确定性（便于版本管理，减少时间戳导致的无意义 diff）：

   ```bash
   MENAV_BOOKMARKS_DETERMINISTIC=1 npm run import-bookmarks
   ```

   - 系统会自动将书签转换为配置文件保存到`config/user/pages/bookmarks.yml`

- **注意**：`npm run dev`命令不会自动处理书签文件，必须先手动运行上述命令
- `npm run dev` 默认会刷新 `articles/projects` 的联网缓存（若你希望离线启动，请使用 `npm run dev:offline`）

5. 构建

```bash
# 启动开发服务器
npm run dev
```

```bash
# 离线启动开发服务器（不刷新联网缓存）
npm run dev:offline
```

```bash
# 生成静态HTML文件
npm run build
```

构建后的文件位于`dist`目录

6. 提交前检查（推荐）

```bash
# 一键检查（语法检查 + 单元测试 + 构建）
npm run check
```

（可选）格式化代码：

```bash
npm run format
```

</details>

## 部署方式

用于将生成的静态站点发布到 服务器 or CI/CD；本地构建见 [快速开始](#快速开始)。

### 快速部署到GitHub Pages（推荐）

<details>
<summary>点击展开</summary>

#### 第一步：前置设置

1. Fork仓库:
   - 点击右上角的 Fork 按钮复制此仓库到您的账号

2. 启用Actions:
   - 进入fork后的仓库
   - 点击顶部的 "Actions" 标签页
   - 点击绿色按钮 "I understand my workflows, go ahead and enable them"

3. 配置Pages:
   - 进入仓库的 Settings -> Pages
   - 在 "Build and deployment" 部分
   - Source: 选择 "GitHub Actions"

#### 第二步：自定义配置

创建个人配置文件:

- **重要:** 始终创建自己的用户配置文件，不要直接修改默认配置文件
- 完成配置文件（见[设置配置文件](#设置配置文件)）
- 提交您的配置文件到仓库

#### 第三步：等待自动部署

- GitHub Actions会自动检测您的更改
- 构建并部署您的网站
- 部署完成后，您可以在 Settings -> Pages 中找到您的网站地址
  - 站点内容的“时效性数据”（RSS 文章聚合、projects 仓库统计）会由部署工作流在构建前自动刷新
  - 也支持定时刷新：默认每天 UTC 02:00 触发一次（GitHub Actions cron 使用 UTC；北京时间=UTC+8，可在 `.github/workflows/deploy.yml` 中调整 `schedule.cron`）

**重要: Sync fork后需要手动触发工作流**:

- 当您使用GitHub界面上的"Sync fork"按钮同步本仓库的更新后
- GitHub Actions工作流不会自动运行
- 您需要手动触发构建流程:
  - 进入 Actions 标签页
  - 选择左侧的 "Build and Deploy" 工作流
  - 点击 "Run workflow" 按钮

</details>

### Docker 部署（可选）

<details>
<summary>点击展开</summary>

仓库已内置 `docker-compose.yml`，并提供 GHCR 预构建镜像；两种方式都建议统一使用 Docker Compose。

> 说明：容器每次启动都会在容器内执行 `npm run build` 生成 `dist/`，然后用 nginx 提供静态文件。
>
> 请在仓库根目录执行（需要 `config/_default` 等文件）。

#### 方式 A：使用预构建镜像（推荐，免本地构建）

```bash
docker compose pull
docker compose up -d --no-build
```

#### 方式 B：本地构建镜像（适合二次开发/改源码）

```bash
docker compose up -d --build
```

默认访问地址：`http://localhost:8080`

#### 可选参数（环境变量）

```bash
MENAV_PORT=80 MENAV_ENABLE_SYNC=true MENAV_IMPORT_BOOKMARKS=true docker compose up -d --no-build
```

- `MENAV_PORT`：宿主机端口（默认 `8080`）
- `MENAV_ENABLE_SYNC`：启动构建时是否联网执行 `sync-*`（默认 `false`，更稳定）
- `MENAV_IMPORT_BOOKMARKS`：启动构建前是否执行 `npm run import-bookmarks`（默认 `false`）

#### 配置与更新

- 配置目录挂载在 `./config`，个人配置按“完全替换策略”建议：将 `config/_default/` 完整复制到 `config/user/` 再修改（见 [设置配置文件](#设置配置文件) 与 `config/README.md`）。
- 如需导入书签：将浏览器导出的书签 HTML 放到 `./bookmarks/`，并设置 `MENAV_IMPORT_BOOKMARKS=true` 后重启容器。
- 修改配置/书签后生效方式（触发重新构建）：

```bash
docker compose restart menav
```

</details>

### 部署到服务器

<details>
<summary>点击展开</summary>

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
        try_files $uri $uri/ /404.html;
    }
}
```

4. 更新配置:
   - 如果您想在服务器上更新网站，只需重复上述步骤1-2
   - 或者设置自动部署流程，例如使用GitLab CI/CD或Jenkins

</details>

### 其他CI/CD托管选项

<details>
<summary>点击展开</summary>

除了GitHub Pages外，您还可以使用其他各种CI/CD服务部署MeNav：

**如 Vercel / Netlify / Cloudflare Pages**:

- 连接您的GitHub仓库
- 设置构建命令为`npm run build`
- 设置输出目录为`dist`

Vercel 部署:

1. 登录 Vercel，点击 `Add New...` → `Project`
2. 选择 `Import Git Repository`，连接并选择你的 MeNav 仓库
3. 构建配置（一般选择 `Other` 或保持默认自动识别即可）：
   - `Build Command`: `npm run build`
   - `Output Directory`: `dist`
   - `Install Command`（可选，但更稳定）：`npm ci`
4. 点击 `Deploy`，等待完成后用 Vercel 分配的域名/自定义域名访问

**如果您只使用第三方平台部署（不使用 GitHub Pages）**：

为避免 GitHub Actions 中的 Pages 配置错误，您可以禁用 GitHub Pages 部署步骤：

1. 进入仓库的 Settings -> Secrets and variables -> Actions
2. 点击 "Variables" 标签页
3. 点击 "New repository variable"
4. 名称填写：`ENABLE_GITHUB_PAGES`
5. 值填写：`false`
6. 点击 "Add variable"

设置后，GitHub Actions 仍会自动构建网站（包括书签处理、RSS 同步等），但会跳过 GitHub Pages 部署步骤，避免报错。第三方平台（如 Vercel/Cloudflare Pages）会自动检测到代码变化并部署。

> 如果你希望在构建时刷新“时效性数据”（RSS 文章聚合、projects 仓库统计），请将构建命令改为：
>
> ```bash
> npm ci && npm run sync-projects && npm run sync-articles && npm run build
> ```
>
> 说明：`sync-*` 会联网抓取并写入 `dev/` 缓存（仓库默认 gitignore）；同步脚本为 best-effort，失败不会阻断后续 `build`。
>
> 备注：`dev/` 只用于构建过程的中间缓存，默认不会被提交到仓库；部署时也只会上传 `dist/`，不会包含 `dev/`。

> **书签转换依赖 GitHub Actions**
> 如果需要使用书签自动推送功能，必须先在 GitHub 仓库中启用 GitHub Actions
>
> **部署流程**：
>
> ```
> 1. 上传书签 → 2. GitHub Actions 处理 → 3. 使用处理完成的代码在 GitHub Pages 自动部署
>                            ↓
>           4. 其他 CI/CD 托管平台检测到变化 → 5. 使用处理完成的代码自动部署
> ```

无论选择哪种部署方式，请确保创建并使用您自己的配置文件，而不是直接修改默认配置。

</details>

## 设置配置文件

MeNav 使用模块化配置方式，将配置分散到多个 YAML 文件中，更易于管理和维护。

完整说明请直接看：[`config/README.md`](config/README.md)（以该文档为准）。

> **🔔 重要提示：** 请务必在`config/user/`目录下创建并使用您自己的配置文件，不要直接修改默认配置文件，以便后续更新项目时不会丢失您的个性化设置。

在加载配置时遵循以下优先级顺序：

1. `config/user/` （用户配置）（优先级最高）
2. `config/_default/` （默认配置）

**注意：** 采用完全替换策略，而非合并。系统会选择存在的用户配置，完全忽略默认配置。

### 最小可用配置（快速指引）

- 首次使用建议先完整复制 `config/_default/` 到 `config/user/`，再按需修改（因为配置采用“完全替换”策略，不会从默认配置补齐缺失项）。
- 至少需要有 `config/user/site.yml`（缺失时构建会直接报错退出，避免生成空白站点）。

## 书签导入功能

MeNav 支持从浏览器导入书签，快速批量添加网站链接；也支持与 MarksVault 扩展集成自动同步。

完整说明请直接看：[`bookmarks/README.md`](bookmarks/README.md)（以该文档为准）。

## Star-History

[![Star History Chart](https://api.star-history.com/svg?repos=rbetree/menav&type=Date)](https://www.star-history.com/#rbetree/menav&Date)
