# 安装与部署指南

本文档覆盖 MeNav 的两种运行形态，既可供人工按步操作，也作为 AI 编程工具执行安装的唯一权威依据。

- **形态一（纯静态站点，默认推荐）**：数据来自 `config/user/` YAML，构建输出静态 `dist/`。
- **形态二（Cloudflare 动态后端，可选）**：由 `workers/`（Cloudflare Worker + D1 + Access）与 `admin/` 提供在线管理台，公开站仍由专属 Pages Git 项目通过 D1 快照构建。

> 概念区分：仓库中的 `docker/Dockerfile.dynamic` 属于**形态一**的容器变体（指“容器启动时执行静态构建”），与 Cloudflare 动态后端无关。

> 使用 AI 安装请先阅读 [AI 安装指南](ai-install.md)；本文档提供具体安装步骤。

---

## 前置条件

- **Node.js**：`>= 22.23.4`（仓库 `.nvmrc` 为 `22`；nvm-windows 对 `.nvmrc` 支持有限，可直接 `nvm use 22` 或确认版本满足要求）。
- **包管理器**：`npm`（Windows 与 WSL/Linux 不要共用 `node_modules`）。
- **Cloudflare 账号**（形态二与 Pages 直传）：需开通 Workers、D1、Pages、Access。使用 Access 前先在 Zero Trust 中启用，并注册 Workers 的 `workers.dev` 子域。
- **Wrangler**（Cloudflare Pages 直传与形态二）：在仓库根目录执行 `npm --prefix workers ci`，再在 `workers/` 下运行 `npx wrangler login`；无交互环境使用 `CLOUDFLARE_API_TOKEN`。

---

## 一、形态一：纯静态站点

### 1.1 本地初始化与预览

```bash
git clone https://github.com/rbetree/menav.git
cd menav
nvm use
npm install
npm run init-config
```

- `npm run init-config` 会在 `config/user/` 不存在时从 `config/_default/` 复制完整配置；若已存在则跳过。
- **重要**：配置采用**完全替换策略**（不合并），一旦存在 `config/user/`，构建会完全忽略 `config/_default/`，请勿直接修改 `config/_default/`。
- 可选导入书签：将浏览器导出的 HTML 放入 `bookmarks/`，运行 `npm run import-bookmarks`（需确定性输出时加 `MENAV_BOOKMARKS_DETERMINISTIC=1`）。`npm run dev` 不会自动处理书签。

启动本地预览或构建：

```bash
npm run dev          # 刷新 RSS/GitHub 缓存 + 构建 + 启动本地服务（默认 http://localhost:5173）
npm run dev:offline  # 离线启动（不刷新联网缓存）
npm run dev:astro    # Astro 开发模式（适合改组件，支持热更新）
npm run sync         # 仅刷新 RSS、projects 仓库统计与贡献热力图缓存（写入 dev/）
npm run build        # 离线构建静态产物到 dist/
```

指定端口：`PORT=5174 npm run dev` 或 `MENAV_PORT=5174 npm run dev`（显式端口被占用会直接报错）。PowerShell 使用 `$env:PORT=5174; npm run dev`。

> Windows 用户如果 `nvm use` 不识别 `.nvmrc`，直接执行 `nvm use 22`，或确认 `node -v` 满足 `>= 22.23.4`。

### 1.2 GitHub Pages 部署（推荐）

1. Fork 本仓库到个人账号。
2. 进入 **Actions** 标签页，启用 Workflows。
3. 进入 **Settings → Pages**，将 Build and deployment 的 Source 设为 **GitHub Actions**。
4. 在本地克隆仓库，先运行 `npm install`（`init-config` 依赖 esbuild），再运行 `npm run init-config` 初始化 `config/user/`，修改后将 `config/user/` 提交并推送到 `main` 分支，等待 `Build and Deploy Site` 工作流完成。
   - 工作流会自动处理 `bookmarks/*.html`、执行 `npm run sync` 刷新时效性数据并运行 `npm run build`。
   - 默认每天 UTC 02:00 定时刷新（可在 `.github/workflows/deploy.yml` 调整）。
   - 查看站点地址：`gh api repos/{owner}/{repo}/pages --jq .html_url`。

5. **Sync fork 注意**：在 GitHub 界面点击 Sync fork 后不会自动触发部署，需到 Actions → `Build and Deploy Site` 点击 **Run workflow**。

> GitHub Pages 需要公开仓库；私有仓库请使用 Cloudflare Pages、Vercel 等第三方托管，并设置 `ENABLE_GITHUB_PAGES=false`。
>
> - **Cloudflare Pages**：Dashboard → **Workers & Pages → Create → Pages → Connect to Git**，选择仓库；Build Command `npm run build`，Output Directory `dist`，Node 版本 `24`（或 `>= 22.23.4`）。
> - **Vercel**：**Add New → Project → Import Git Repository**，Framework 选 Other；Build Command `npm run build`，Output Directory `dist`，Node 版本 `24`（或 `>= 22.23.4`）。

### 1.3 Docker 部署

> 默认镜像（根目录 `Dockerfile`）在构建阶段生成 `dist/`，运行阶段以非 root 的 `nginx` 用户监听容器内 `8080` 端口。修改配置或书签后需重新构建镜像。

**方式 A：使用 GHCR 预构建镜像（包含默认示例站）**

```bash
docker compose pull
docker compose up -d --no-build
```

**方式 B：本地构建镜像（使用当前 `config/` 与 `bookmarks/`）**

```bash
docker compose up -d --build
```

可选构建参数与宿主机端口：

```bash
MENAV_PORT=8000 MENAV_ENABLE_SYNC=true MENAV_IMPORT_BOOKMARKS=true docker compose up -d --build
```

PowerShell 不支持前置环境变量，先逐项设置 `$env:MENAV_PORT="8000"` 等，再执行 `docker compose up -d --build`。

- `MENAV_PORT`：宿主机端口（默认 `80`，容器内固定 `8080`）
- `MENAV_ENABLE_SYNC`：构建时是否执行 `npm run sync`（默认 `false`）
- `MENAV_IMPORT_BOOKMARKS`：构建前是否执行 `npm run import-bookmarks`（默认 `false`）

**方式 C：挂载配置、重启即重建（`docker/Dockerfile.dynamic`）**

```bash
docker build -f docker/Dockerfile.dynamic -t menav:dynamic .
docker run --rm -p 80:8080 \
  -v "$PWD/config:/app/config" \
  -v "$PWD/bookmarks:/app/bookmarks" \
  -e MENAV_ENABLE_SYNC=false \
  -e MENAV_IMPORT_BOOKMARKS=false \
  menav:dynamic
```

容器以非 root 的 `node` 用户（UID 1000）运行；启用 `MENAV_IMPORT_BOOKMARKS=true` 时挂载目录需对 UID 1000 可写。

### 1.4 自有服务器与其他 CI/CD（Vercel / Netlify / Cloudflare Pages）

**自有服务器**：运行 `npm run build`（需刷新缓存则 `npm run sync && npm run build`），将 `dist/` 部署到 Web 服务器根目录。Nginx 参考配置：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/dist;
    index index.html;

    error_page 404 /404.html;
    location = /404.html {
        internal;
        add_header Cache-Control "no-store" always;
    }
    location / {
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-store" always;
    }
}
```

**Vercel / Netlify / Cloudflare Pages**：

- Node 版本：`24`（或 `>= 22.23.4`）
- Install Command：`npm ci`
- Build Command：`npm run build`（需刷新缓存则 `npm run sync && npm run build`）
- Output Directory：`dist`
- 若不使用 GitHub Pages，在仓库 **Settings → Secrets and variables → Actions → Variables** 新增 `ENABLE_GITHUB_PAGES=false`，避免 Actions 报错同时保留书签自动转换。变量只对后续 workflow run 生效；设置后重新触发工作流，已启动的 run 仍会执行部署并可能失败。

**Cloudflare Pages 直传部署**：先准备依赖、登录并构建，再用仓库脚本创建项目并上传：

```bash
npm ci
npm --prefix workers ci   # 安装 wrangler
cd workers
npx wrangler login
cd ..
npm run build
# 提交 config/user/ 等改动，确保工作区干净
npm run pages:create -- YOUR_PROJECT_NAME
npm run pages:deploy -- YOUR_PROJECT_NAME
```

`npm run pages:create` 要求工作区干净，创建前后都会检查 Git 状态。当前 wrangler（实测 4.156 起）在没有 `--force` 时会把项目委托给 Cloudflare Workers，自动修改 `astro.config.mjs`、`package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore`，并生成根目录 `wrangler.jsonc` 与 `public/`；脚本检测到这类改动时会还原跟踪文件、只删除 wrangler 生成的未跟踪文件，然后报错退出，避免后续构建因缺少 `config/user/` 或 `config/_default/` 失败。

> 手动执行时使用 `npm --prefix workers exec -- wrangler pages project create YOUR_PROJECT_NAME --production-branch main --force`；只有创建时需要 `--force`，`pages deploy` 不要再加。`.wrangler/` 残留（例如 `.wrangler/deploy/config.json` 指向不存在的 `dist/client/wrangler.json`）会导致后续 Pages 部署失败，删除 `.wrangler/` 后再部署。

> 绑定 Pages 自定义域时，需要在 DNS 添加一条 CNAME 记录指向 `YOUR_PROJECT_NAME.pages.dev`，并开启 Proxied；否则域名会停在 pending，报 `CNAME record not set`。绑定接口需要 Zone/DNS 相关权限；只有 Pages 权限时无法完成证书验证，HTTPS 会返回 525。添加后在 Pages 项目的 Custom domains 中确认验证通过、证书 active。

### 1.5 形态一验证清单

```bash
npm run check            # 必须通过（lint + 单元测试 + 构建 + 审计 + 类型检查）
```

确认 `dist/index.html`、`dist/404.html`、`dist/search-index.json` 已生成；本地启动 `npm run dev:offline` 访问 `http://localhost:5173`，验证页面切换（`/?page=<id>`）与搜索正常。

---

## 二、形态二：Cloudflare 动态后端

> 本节只给首次安装的最短步骤。资源清单、Token/TTL、doctor/verify 规则、数据契约、回滚与故障排查统一见 [动态后端运维手册](backend.md)。

### 2.1 前置条件

- Cloudflare 账号，Zero Trust 已启用，Workers 的 `workers.dev` 子域已注册；开通 Workers、D1、Pages、Access。
- 已完成 `npm ci` 与 `npm --prefix workers ci`；Wrangler 登录方式见本文前置条件。
- Access、Service Token、Pages Git 项目优先用 Cloudflare MCP/API 创建；MCP 不可用或需要浏览器授权时再用 Dashboard。
- 资源：D1 数据库、Worker、Access 应用与 Service Token、Pages Git 项目。清单见 [资源与凭证](backend.md#二资源与凭证)。

### 2.2 初始化配置

```bash
npm run backend:init                    # 只生成 workers/wrangler.jsonc
npm run backend:init -- --with-test     # 另生成 workers/wrangler.test.jsonc
npm run backend:init -- --with-local    # 另生成 workers/wrangler.local.jsonc 与 .dev.vars
npm run backend:init -- --all           # 三份都生成
```

三份配置职责分开：`wrangler.jsonc` 只放生产，`wrangler.test.jsonc` 只放 `env.staging` 测试资源，`wrangler.local.jsonc` 使用本地 D1。已存在的文件会跳过；生成文件均被 `.gitignore` 忽略，切勿提交。

### 2.3 创建 D1 与填写生产配置

以下命令在 `workers/` 下运行：

```bash
cd workers
npx wrangler d1 create menav-db
npx wrangler whoami                  # 查看 CF_ACCOUNT_ID
```

将 `database_id` 和以下变量填入 `workers/wrangler.jsonc`：

- `TEAM_DOMAIN`：Zero Trust → Settings 中的团队域名，不带结尾斜杠。
- `POLICY_AUD`：Access 应用的 AUD。可以暂留占位符，等 2.5 创建应用后补填并重新部署。
- `CF_ACCOUNT_ID`：`npx wrangler whoami` 返回的账号 ID。
- `CF_PAGES_PROJECT`：动态公开站的 Pages 项目名；示例配置里是 `REPLACE_WITH_PAGES_PROJECT`。

写入两个 Worker secret：

```bash
npx wrangler secret put CF_API_TOKEN   # 具有目标账号 Pages Edit 权限
npx wrangler secret put BUILD_TOKEN    # 需与 Pages 的 MENAV_BUILD_TOKEN 一致
```

`BUILD_TOKEN` 用 `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` 生成。`CF_API_TOKEN` 的权限、预填链接与账号级 Token TTL 细节见 [资源与凭证](backend.md#二资源与凭证)；Token 由用户直接粘贴到 `wrangler secret put` 提示，不要写入仓库或交给 AI 读取。

### 2.4 部署 Worker

回到仓库根目录：

```bash
npm run backend:doctor
npm run backend:deploy
```

`backend:doctor` 对缺失 `POLICY_AUD` 只给警告，必需值缺失才会阻止部署；资源检查和 staging 隔离规则见 [部署 Worker](backend.md#三部署-worker)。测试环境使用：

```bash
npm run backend:deploy:test
```

### 2.5 配置 Access 与 Pages

1. **Access Self-hosted 应用**：保护 Worker 后台域名与管理 `/api/*`，策略仅允许管理员身份。创建后在 Overview 复制 AUD，填入 `workers/wrangler.jsonc` 的 `POLICY_AUD`，再次执行 `npm run backend:deploy`。
2. **Service Auth**：在同一应用内新增 `decision: non_identity` 策略（Include 选 `Any Access Service Token`），创建 Service Token；不要把 `/api/*` 设为 Bypass。
3. **Pages Git 项目**：连接仓库，Build Command `npm run build:snapshot`，Output Directory `dist`，关闭 Git 触发的生产与预览自动部署。
4. **Pages 生产环境变量**：`MENAV_BACKEND_URL`、`MENAV_BUILD_TOKEN`（Secret）、`CF_ACCESS_CLIENT_ID`、`CF_ACCESS_CLIENT_SECRET`（Secret）、`NODE_VERSION=24`。逐项说明见 [资源与凭证](backend.md#二资源与凭证)。

Access 权限、Service Token 与 Pages 自定义域细节见 [Access 与管理台](backend.md#四access-与管理台) 和 [Pages 与首次发布](backend.md#五pages-与首次发布)。

### 2.6 导入种子并首次发布

```bash
npm run backend:seed
```

登录管理台，在「数据与备份 → 导入备份 JSON」上传 `workers/.seed.json`，再点击「立即发布」。首次发布以管理台点击为主；AI 通过 Access 一次性 PIN 自动发布需要浏览器自动化，不是默认路径。数据契约与发布状态核对见 [Pages 与首次发布](backend.md#五pages-与首次发布)。

### 2.7 本地开发

```bash
npm run backend:init -- --with-local
npm run backend:dev:local
```

本地配置使用 `remote: false` 的本地 D1，`.dev.vars` 设置 `ALLOW_INSECURE_DEV=1` 跳过 Access 鉴权；不要用生产配置做本地写入。完整说明见 [本地开发](backend.md#七本地开发)。

### 2.8 验证清单

```bash
npm run backend:check
npm run backend:test
```

线上核对 Worker 登录、首次发布、`/menav-build.json` 的 `revision` 与公开站匿名访问，详见 [部署后检查清单](backend.md#六部署后检查清单)。发布或回滚后运行 `npm run backend:verify` 做只读版本核对，退出码与对齐方式见 [部署与运维](backend.md#十部署与运维)。
