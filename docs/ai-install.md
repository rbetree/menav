# AI 安装指南

本文件供具备文件读写与终端执行能力的 AI 编程工具阅读。人类安装步骤见 [安装与部署指南](install.md)。

如果当前目录不是 MeNav 仓库，先读远程仓库的 `docs/ai-install.md` 与 `docs/install.md`；选定形态后再决定 fork（部署到个人仓库）或 git clone（仅本地/Docker）。如果已经 clone 主仓库，后续要个人部署时用 `gh repo fork --remote` 把 origin 切到用户仓库；不要假设本地已有仓库。

## 一、你的任务

协助用户安装和配置 MeNav。先读本文件，再按下方顺序读取项目文档；不要凭记忆补命令，不要编造仓库里不存在的脚本或配置项。

## 二、必读顺序

1. [安装与部署指南](install.md)：所有安装、构建、部署命令以此为准。
2. 用户选择形态二时，读 [动态后端运维手册](backend.md)：部署顺序、Access、Pages 发布与数据契约。
3. 需要修改配置时，读 [配置指南](configuration.md)：字段、完全替换策略、未知字段校验。
4. 遇到 Cloudflare 或 GitHub 的细节，先查官方文档或 MCP 的 `docs()`，不要凭记忆写命令。

## 三、开始前

1. 先问用户选择哪种形态，未回答前不要修改文件、不要执行远程命令：
   - 形态一：纯静态站点（GitHub Pages / Docker / 自有服务器 / 仅本地预览）
   - 形态二：Cloudflare 动态后端（Worker + D1 + Access + Pages Git 项目）
2. 检查本机环境：`node -v`（>= 22.23.4）、`npm -v`、`git --version`。
3. 按形态检查额外工具：
   - 形态一 GitHub Pages、形态二：`gh --version`
   - Cloudflare Pages 直传（任形态）与形态二：Wrangler 登录状态（`npm --prefix workers exec -- wrangler whoami` 或 `CLOUDFLARE_API_TOKEN`）；首次使用先执行 `npm --prefix workers ci`
   - 形态二还需要 Cloudflare 访问方式：MCP 可用（推荐）或 `CLOUDFLARE_API_TOKEN`，并确认 Zero Trust 已启用、`workers.dev` 子域已注册
   - Docker / 自有服务器 / 仅本地：按 install.md 对应小节检查 Docker 或构建环境
4. 缺少工具时，先给出安装命令并等用户确认；不要擅自执行全局安装。

## 四、GitHub 准备

GitHub 操作用 `gh` CLI 和 `git`，不要只依赖 `git`：`git` 只能推送代码，不能 fork 仓库、启用 Actions 或设置 Pages。

1. 检查登录：`gh auth status`。
2. 未登录或缺少权限时执行 `gh auth login --web --scopes repo,workflow`；已有登录缺 scope 时执行 `gh auth refresh --scopes workflow`。
3. 静态 GitHub Pages：
   - 先检查仓库可见性：GitHub Pages 需要公开仓库；私有仓库跳过 GitHub Pages，改用 Cloudflare Pages 或其他第三方托管，并设置 `ENABLE_GITHUB_PAGES=false`；变量只对后续 workflow run 生效，设置后重新触发。
   - 选定部署到个人仓库后，用 `gh repo fork rbetree/menav --clone` 创建个人仓库；如果已 clone 主仓库，用 `gh repo fork --remote` 把 origin 切到用户仓库后再推送。
   - **先启用部署工作流，再推送**：fork 仓库默认不运行 Actions，push 之后启用不会补触发。执行 `gh workflow enable "Build and Deploy Site"`；命令失败时让用户在 Actions 页面点击启用。
   - 设置 Pages 构建来源：

     ```bash
     gh api --method GET repos/{owner}/{repo}/pages >/dev/null 2>&1 \
       && gh api --method PUT repos/{owner}/{repo}/pages -f build_type=workflow \
       || gh api --method POST repos/{owner}/{repo}/pages -f build_type=workflow
     ```

     `{owner}/{repo}` 替换为用户仓库；需要仓库管理员/维护者权限或 Pages 管理权限，经典 PAT 需要 `repo` scope。PowerShell 不支持 `/dev/null`，可改用 `2>$null`，或直接分别执行 GET 与 POST/PUT。

   - 推送后如果工作流没有启动，执行 `gh workflow run "Build and Deploy Site"`。
   - 用 `gh run list --workflow "Build and Deploy Site"` 查看运行，等待完成；站点地址用 `gh api repos/{owner}/{repo}/pages --jq .html_url` 获取。

4. 动态形态：GitHub 只作为 Cloudflare Pages Git 项目的源码来源。Fork 并推送后，先检查 Cloudflare GitHub App 是否已有目标仓库权限；有权限可直接用 API 创建 Pages Git 项目，没有权限再让用户在 Dashboard 授权。
5. GitHub MCP 可选，不是必需。官方工具集没有 Pages 站点配置；即使使用 GitHub MCP，Pages 设置仍走 `gh api`。

## 五、Cloudflare 工具与凭证

1. Cloudflare MCP 推荐但非必需：可以添加 `https://mcp.cloudflare.com/mcp` 并在浏览器完成 OAuth；没有 MCP 时使用 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` 直接调用 Cloudflare API，不要因此停下安装。
2. 先确认 Zero Trust 已启用、Workers 的 `workers.dev` 子域已注册；否则 Access 应用和 Worker 域名无法使用。
3. Wrangler 用于 D1 创建、secret 写入、Worker 部署与本地开发：在仓库根目录执行 `npm --prefix workers ci`，再在 `workers/` 下运行 `npx wrangler login`；无交互环境使用 `CLOUDFLARE_API_TOKEN`。
4. `CF_API_TOKEN` 是 Worker 运行时凭证，必须是 Pages Edit（或 Pages Write）权限的 Token。优先复用环境里的 `CLOUDFLARE_API_TOKEN`；没有时让用户创建用户级 Token。权限、预填链接、账号级 Token 的 TTL 与 secret 写入方式统一见 [资源与凭证](backend.md#二资源与凭证)。Token 由用户直接粘贴到 `npx wrangler secret put CF_API_TOKEN` 提示；不要让用户把 Token 贴到聊天，也不要读取剪贴板。
5. 工具分工：Cloudflare MCP/API 优先；Wrangler 负责 D1、secret 与 Worker 部署；Dashboard 只作兜底。
6. 只有真正需要用户参与的步骤才交给用户：MCP OAuth、Cloudflare GitHub App 授权、Access 登录、首次发布，以及没有可复用 `CLOUDFLARE_API_TOKEN` 时的 `CF_API_TOKEN` 创建。
7. Access 应用、Service Auth 策略和 Service Token 需要 `Access: Apps and Policies Edit` / `Access: Service Tokens Edit`；授权必须由用户在浏览器完成。权限不足时停下让用户授权，不要退回 wrangler OAuth 创建 Access。`POLICY_AUD` 可等 Access 应用创建后补填，doctor 只警告；Worker 后台在补齐前返回 503。

## 六、形态一：AI 执行协议

1. 按 [install.md](install.md) 的 1.1–1.5 执行；先 `npm install` 再 `npm run init-config`，不要跳过依赖安装。
2. 修改 `config/user/`，不要修改 `config/_default/`。
3. GitHub Pages：先启用 `Build and Deploy Site` 工作流并用 `gh api` 设置 Pages 来源，再 push；fork 默认不运行 Actions。push 后未触发时执行 `gh workflow run "Build and Deploy Site"`。
4. 私有仓库跳过 GitHub Pages，按 install.md 1.2 连接 Cloudflare Pages 或 Vercel，并设置 `ENABLE_GITHUB_PAGES=false`；变量只对后续 workflow run 生效。
5. Cloudflare Pages 直传按 install.md 1.4：`npm ci`、`npm --prefix workers ci`、Wrangler 登录、`npm run build`、干净工作区，再用 `pages:create` 与 `pages:deploy`（例如 `npm run pages:deploy -- YOUR_PROJECT_NAME`）。
6. 完成后按 install.md 1.5 验证；确认红线见第八节。

## 七、形态二：AI 执行协议

1. 按 [install.md](install.md) 第二节与 [backend.md](backend.md) 执行；本文件不复述命令和配置字段。
2. 顺序：D1/Worker（`POLICY_AUD` 可暂缺）→ Access（补 AUD 并重新部署）→ Pages → seed/首次发布。
3. 测试环境：`backend:init -- --with-test`，用 `backend:doctor -- --config wrangler.test.jsonc` 检查。生产 `wrangler.jsonc` 存在时比较 Worker 名与 D1；缺失时只警告，不阻断测试环境搭建。
4. 本地开发：`backend:init -- --with-local` 与 `backend:dev:local`，不要用生产配置做本地写入。
5. 首次发布以用户在管理台导入种子并点击「立即发布」为主；AI 通过 Access 一次性 PIN 自动发布需要浏览器自动化，且 Access 应用需启用 One-time PIN，不是默认路径。
6. 管理 API 的写操作带 `If-Match: <ETag>` 时校验并发，不带时跳过；`/api/rebuild` 不需要 `If-Match`。管理 API 只接受身份 JWT，Access Service Token 会被 Worker 以 403 拒绝。
7. 发布或回滚后运行 `npm run backend:verify`；退出码、对齐方式与数据契约见 [部署与运维](backend.md#十部署与运维) 和 [数据契约与升级](backend.md#八数据契约与升级)。

## 八、确认与安全

- 不修改 `config/_default/`，始终通过 `npm run init-config` 初始化后在 `config/user/` 修改。
- 不把真实 D1 ID、Access AUD、API Token、`workers/wrangler.jsonc`、`workers/.dev.vars` 写入 Git 或提交到仓库。
- Token 由用户直接粘贴到 `wrangler secret put` 交互提示；不要让用户把 Token 贴到聊天，也不要用剪贴板读取，避免进入 AI 会话记录、仓库或日志。
- 生产环境绝对不要设置 `ALLOW_INSECURE_DEV=1`；它会放行任意 `.workers.dev` 主机。
- 执行以下操作前，先展示完整命令并等用户确认：`git push`、`gh repo fork`、`gh api` 写操作、`wrangler d1 create`、`wrangler deploy`、`wrangler secret put`、`npm run pages:create`、`npm run pages:deploy`、Cloudflare API 写操作、全局安装。
- Cloudflare Pages 直传前先执行 `npm --prefix workers ci`；`pages:create` 依赖 `workers/node_modules/wrangler`，只装根依赖不够。
- 不编造命令、配置字段或 Cloudflare 控制台步骤；不确定时查仓库文档、MCP `docs()` 或官方文档。
- 完成后按 install.md 的验证清单执行检查，并向用户汇报实际结果。

## 九、工具安装与官方文档

只列安装或排障时会用到的依赖；版本要求以仓库 `package.json` / `.nvmrc` 为准。

| 工具                  | 用途                              | 安装                                                                                                               | 使用                                                                                                                 | 必需性                    |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Node.js               | 运行构建与脚本，要求 `>= 22.23.4` | [nodejs.org/en/download](https://nodejs.org/en/download)                                                           | [Node.js 文档](https://nodejs.org/en/docs)                                                                           | 必需                      |
| npm                   | 安装依赖、运行脚本                | 随 Node.js 提供                                                                                                    | [docs.npmjs.com](https://docs.npmjs.com/)                                                                            | 必需                      |
| nvm / nvm-windows     | 切换 Node 版本                    | [nvm-sh/nvm](https://github.com/nvm-sh/nvm)、[coreybutler/nvm-windows](https://github.com/coreybutler/nvm-windows) | 各自 README                                                                                                          | 可选                      |
| Wrangler              | D1、secret、Worker 与 Pages 部署  | [Wrangler 安装与更新](https://developers.cloudflare.com/workers/wrangler/install-and-update/)                      | [Wrangler 命令参考](https://developers.cloudflare.com/workers/wrangler/)                                             | 形态二与 Pages 直传必需   |
| Cloudflare D1         | 动态后台数据库                    | [D1 文档](https://developers.cloudflare.com/d1/)                                                                   | [D1 命令](https://developers.cloudflare.com/d1/wrangler-commands/)                                                   | 形态二必需                |
| Cloudflare Zero Trust | 启用 Access                       | [Zero Trust 设置](https://developers.cloudflare.com/cloudflare-one/setup/)                                         | [Access 文档](https://developers.cloudflare.com/cloudflare-one/access-controls/)                                     | 形态二必需                |
| Access One-time PIN   | AI 代做首次发布时的可选登录方式   | [One-time PIN](https://developers.cloudflare.com/cloudflare-one/identity/one-time-pin/)                            | 同上                                                                                                                 | 可选                      |
| Cloudflare API Token  | 创建 Worker 运行时 `CF_API_TOKEN` | [创建 Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)                         | [权限与预填链接](backend.md#二资源与凭证)                                                                            | 形态二必需                |
| Cloudflare Pages Git  | 连接仓库构建公开站                | [Pages Git Integration](https://developers.cloudflare.com/pages/get-started/git-integration/)                      | 同上                                                                                                                 | 形态二必需                |
| GitHub CLI            | Fork、Actions、Pages、API 操作    | [cli/cli 安装](https://github.com/cli/cli#installation)                                                            | [gh 手册](https://cli.github.com/manual/)                                                                            | GitHub Pages 与形态二必需 |
| GitHub Actions        | 启用/禁用 `Build and Deploy Site` | [启用或禁用工作流](https://docs.github.com/en/actions/using-workflows/disabling-and-enabling-a-workflow)           | 同上                                                                                                                 | GitHub Pages 必需         |
| Docker                | 容器部署与本地验证                | [Docker 安装](https://docs.docker.com/get-docker/)                                                                 | [Docker Compose](https://docs.docker.com/compose/)                                                                   | 可选                      |
| Playwright            | 浏览器契约测试                    | [Playwright 安装](https://playwright.dev/docs/intro)                                                               | 同上                                                                                                                 | 开发/测试可选             |
| MCP                   | 连接 Cloudflare MCP               | [MCP 规范](https://modelcontextprotocol.io/)                                                                       | [Cloudflare MCP](https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/) | 推荐，可选                |

## 十、官方参考

- [API token 预填链接](https://developers.cloudflare.com/fundamentals/api/how-to/account-owned-token-template/)
- [Cloudflare Skills](https://github.com/cloudflare/skills)
- [Cloudflare Agent Setup（Claude Code 等）](https://developers.cloudflare.com/agent-setup/)
- [Cloudflare 文档索引（llms.txt）](https://developers.cloudflare.com/llms.txt)
- [GitHub Pages REST API](https://docs.github.com/en/rest/pages/pages)
- [GitHub Actions Workflow API](https://docs.github.com/en/rest/actions/workflows)
- [GitHub MCP Server](https://github.com/github/github-mcp-server)
