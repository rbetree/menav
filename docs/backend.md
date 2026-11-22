# 动态后台部署与维护

动态后台使用 Worker + D1 + Access。公开站由专属 Pages Git 项目运行 Astro 构建，部署静态 `dist/`。Pages 只从 Git 获取应用源码，业务输入由 Worker 为每次发布冻结到 D1。

首次安装与部署步骤见 [安装与部署指南](install.md)，本文档聚焦日常运维、数据契约与故障排查。

> 部署顺序：资源与凭证 → D1 → Worker → Access → Pages → 首次发布。`POLICY_AUD` 可以在 Worker 首次部署后补填，再执行一次 `npm run backend:deploy`。D1、Worker、Secret 用 Wrangler；Access、Service Token、Pages 项目优先用 Cloudflare MCP/API，MCP 不可用或需要浏览器授权时再用 Dashboard。

## 一、前置条件

| 类别 | 需要准备                    | 说明                                                                  |
| ---- | --------------------------- | --------------------------------------------------------------------- |
| 账号 | Cloudflare 账号             | 需要 Workers、D1、Pages、Access；免费计划可起步，配额以官方定价页为准 |
| 账号 | Zero Trust 与 workers.dev   | Access 需要先启用 Zero Trust；Worker 需要注册 `workers.dev` 子域      |
| 仓库 | GitHub 仓库                 | Pages 项目从 Git 获取应用源码，不读取业务数据                         |
| 本地 | Node.js >= 22.23.4          | 与 `package.json` 的 `engines` 一致                                   |
| 本地 | npm                         | 已完成 `npm ci` 与 `npm --prefix workers ci`                          |
| 资源 | D1 数据库                   | 保存页面、分类、站点与发布状态                                        |
| 资源 | Worker                      | 提供后台与管理 API；默认使用 `workers.dev` 域名                       |
| 资源 | Access 应用与 Service Token | 保护后台域名，并让 Pages 构建领取冻结快照                             |
| 资源 | Pages Git 项目              | 运行 `npm run build:snapshot` 生成公开站                              |

首次部署需要创建四类资源（D1、Worker、Access、Pages），并配置两个 Worker secret、五个 Pages 环境变量（其中两个 secret）。完整清单见下一节。

> Worker 默认使用 `workers.dev` 域名。自定义域属于可选的 Cloudflare Dashboard 配置；`wrangler.example.jsonc` 里有注释掉的 `routes` 示例，支持 `custom_domain`、`zone_name` 或 `zone_id`，取消注释并填写后生效，`backend:doctor` 会校验格式。

## 二、资源与凭证

使用独立的后台域名（默认 `workers.dev`）和公开站 Pages 项目，避免影响已有静态站。以下命令会创建或更新真实云资源，应在确认目标账号后执行。

在 `workers/` 目录运行 `npx wrangler d1 create menav-db`，把返回的 `database_id` 填入本地 `wrangler.jsonc`（从 `wrangler.example.jsonc` 复制）或 `wrangler.test.jsonc` 的对应绑定。Worker 首次运行自动创建或增量升级表，不清空业务数据。

> 仓库提交 `wrangler.example.jsonc`、`wrangler.test.example.jsonc` 与 `wrangler.local.example.jsonc`。`wrangler.jsonc`、`wrangler.local.jsonc` 与 `wrangler.test.jsonc` 都不入库；部署前脚本只检查本次部署实际使用的环境。生产、测试、本地三份配置职责分开：`wrangler.jsonc` 不再包含 `env.staging`，测试环境只使用 `wrangler.test.jsonc` 的 `env.staging`。`npm run backend:init -- --with-test --with-local` 可一次生成测试与本地配置，已存在的文件不会覆盖。测试环境部署使用 `npm run backend:deploy:test`。

| 位置                  | 配置                      | 用途                                                                       |
| --------------------- | ------------------------- | -------------------------------------------------------------------------- |
| Worker vars           | `TEAM_DOMAIN`             | 完整 Access 团队地址，如 `https://team.cloudflareaccess.com`，不带结尾斜杠 |
| Worker vars           | `POLICY_AUD`              | 管理后台 Access 应用的 AUD                                                 |
| Worker vars           | `CF_ACCOUNT_ID`           | Pages 所在账号 id                                                          |
| Worker vars           | `CF_PAGES_PROJECT`        | 动态公开站的 Pages 项目名                                                  |
| Worker secret         | `CF_API_TOKEN`            | 目标账号的 Cloudflare Pages 编辑权限，用于创建和读取部署                   |
| Worker secret         | `BUILD_TOKEN`             | 足够长的随机构建读取凭证，与 Pages 的值相同                                |
| Pages 生产环境        | `MENAV_BACKEND_URL`       | 可访问 Worker 的 HTTPS 地址                                                |
| Pages 生产环境 secret | `MENAV_BUILD_TOKEN`       | 对应 Worker `BUILD_TOKEN`                                                  |
| Pages 生产环境        | `CF_ACCESS_CLIENT_ID`     | Access Service Token 的 Client ID（若后台启用 Access）                     |
| Pages 生产环境 secret | `CF_ACCESS_CLIENT_SECRET` | 对应 Service Token 的 Client Secret                                        |
| Pages 生产环境        | `NODE_VERSION=24`         | Node 版本                                                                  |

> `CF_ACCOUNT_ID` 可用 `npm --prefix workers exec -- wrangler whoami` 查看；`POLICY_AUD` 在 Access 应用的 Overview 页；`BUILD_TOKEN` 用随机 hex 生成：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。

> 本节凭证表已列出 `CF_API_TOKEN` 的权限。优先复用环境里的 `CLOUDFLARE_API_TOKEN`；没有时优先让用户创建用户级 Token（**My Profile → API Tokens → Create Custom Token → Pages Edit**），`cfut_` Token 创建后立即生效。如果使用账号级 `cfat_` Token，先看当前 MCP/OAuth 连接是否有 `account_api_tokens:create`，有就创建账号级 API Token（权限 Pages Edit 或 Pages Write，受 OAuth 授权 scope 限制），没有该权限或返回 403 再由用户在 Dashboard 创建账号级 Account API Token。账号级 1 day TTL 的 `not_before` 可能从次日 00:00 +0800 开始，刚创建时 Pages API 会返回 401；先查 `/accounts/{account_id}/tokens/verify` 的 `not_before` 和 `expires_on`，必要时让用户把开始时间设为现在，或改用用户级 Token。用户级 `/user/tokens` 需要 `API Tokens Read` / `API Tokens Write`，OAuth 不覆盖。拿到后由用户直接粘贴到 `npx wrangler secret put CF_API_TOKEN` 的交互提示，不写入仓库、日志或 AI 会话。预填 Pages Edit 权限的链接：[用户级 Token](https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=%2A&zoneId=all&name=MeNav%20Pages%20Token)；[账号级 Token](https://dash.cloudflare.com/?to=/:account/api-tokens&permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%5D&name=MeNav%20Pages%20Token)。

Pages 环境变量可复制 `workers/pages.env.example` 逐项填写。Worker 密钥在 `workers/` 下通过交互输入保存，勿写入源码：

```bash
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put BUILD_TOKEN
```

`CF_PAGES_URL` 是 Pages 自动提供的本次部署 URL，不手工填写。构建 Token 只能领取当前部署的冻结快照，不能写管理 API。Cloudflare API Token 始终保留在 Worker，不进入快照。

## 三、部署 Worker

1. 在仓库根目录执行 `npm run backend:init`，从示例生成 `workers/wrangler.jsonc`；需要测试环境时加 `--with-test`，本地开发加 `--with-local`。
2. 填入 D1 的 `database_id`，以及 `TEAM_DOMAIN`、`CF_ACCOUNT_ID`、`CF_PAGES_PROJECT`。`POLICY_AUD` 可以暂留占位符，等 Access 应用创建后补填并重新部署。测试配置在 `env.staging` 中填写独立的 Worker 名与测试 D1。
3. 执行 `npm run backend:doctor` 检查生产配置；执行 `npm run backend:doctor -- --config wrangler.test.jsonc` 检查测试配置。
4. 按上一节设置 `CF_API_TOKEN` 与 `BUILD_TOKEN` 两个 secret。
5. 执行 `npm run backend:deploy`（先自检再部署）；测试环境使用 `npm run backend:deploy:test`（读取本机 `wrangler.test.jsonc`）。

`backend:doctor` 会检查 D1 与必需 vars 是否是占位符：`POLICY_AUD` 缺失只警告，其余必需值缺失报错。测试配置会读取同目录的生产 `wrangler.jsonc`：存在时比较 Worker 名、D1 ID 与 D1 名称；不存在或生产值未填时只警告，说明未做隔离比对。`routes` 支持 `custom_domain`、`zone_name` 或 `zone_id`。设置 `CLOUDFLARE_API_TOKEN` 与账号 ID 时，还会只读检查 D1、Pages 项目和 Access 应用是否存在；Token 缺少对应权限或未设置时标注“未检查”，不会打印 secret。

`admin/` 静态资源通过 Wrangler ASSETS 随 Worker 一起部署，包括图标选择器依赖的 Font Awesome 字体与图标清单；`run_worker_first` 保证资源返回前先鉴权。

> ⚠️ `wrangler.jsonc`（从示例复制）的 D1 绑定带 `remote: true`，本地 `wrangler dev` 会**连接远端库并写入真实数据**。仅做只读调试可直接运行；需要在本地撰写数据时，先 `npx wrangler d1 export` 备份，或用一份独立 D1。

## 四、Access 与管理台

1. 为后台域名创建 Access Self-hosted 应用，策略仅允许管理员身份。
2. 管理台全部静态资源（`/`、`/index.html`、`/app.js`、`/style.css`、`/vendor/*`、`/icons/*`）和管理 `/api/*` 走该应用。Worker 再验证 JWT 的签名、issuer、audience 和过期时间，并要求 `sub` 为非空字符串且不含 `common_name`：管理 API 只接受身份型令牌，Access Service Token 形状的令牌即使能通过 Access 也会被 Worker 以 403 拒绝。从 `workers.dev` 直连也不能绕过验证。后台 API 与 HTML 响应设置 `Cache-Control: no-store`；`app.js`、`style.css` 等静态资源使用 `private, max-age=300`。
3. `/build/snapshot` 需要独立 Bearer 凭证到达 Worker。实测可行做法：在 Access 应用内新增一条 **Service Auth（`decision: non_identity`）** 策略，Include 选 `Any Access Service Token`；再建一个 Service Token，把其 Client ID/Secret 配到 Pages 构建环境（`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`），`build-snapshot` 会在请求里带上这两个头。Worker 仍执行构建 Token 校验。构建路径只使用这套独立 Service Auth 加 `BUILD_TOKEN`，不能调用管理 API。注意：Access 策略的 `exclude` 语义是「拒绝」而非「放行」，且 `allow` 策略即使带 Service Token 也会要求登录——必须用 Service Auth 才能让服务身份免登录通过。
4. 公开站使用 Pages 的独立域名，保持匿名访问。

> Access 应用、策略与 Service Token 需要 `Access: Apps and Policies Edit` / `Access: Service Tokens Edit` 权限；wrangler OAuth token 不能管理 Access，权限不足时先补权限。

不要把完整 `/api/*` 设为 Bypass。后台与写 API 都经过 Access；公开站始终消费已构建的静态产物。

## 五、Pages 与首次发布

1. 创建连接本仓库的 **Pages Git 项目**，选择包含动态后台代码的生产分支。根目录为仓库根目录，构建命令 `npm run build:snapshot`，输出目录 `dist`。先检查 Cloudflare GitHub App 是否已有目标仓库权限；有权限可直接用 API 创建，没有权限再在 Dashboard 授权。
2. 配置上一节的 Pages 生产环境变量和密钥，可复制 `workers/pages.env.example` 逐项填写；关闭 Git 提交触发的生产自动部署及预览分支自动部署。保留 Git 源码访问，部署由 Worker 调用 Pages API 发起。构建会自动把 `MENAV_BACKEND_URL` 写入公开站右下角的「管理」悬浮按钮，无需在 `site.yml` 另配 `admin_url`。
3. 项目创建时的自动首构建没有对应发布任务，会因缺少快照失败；不会更新公开内容。完成配置后通过后台或带用户会话的管理 API 发起首次发布，不使用 Pages 控制台的重试按钮代替。
4. 登录已部署的后台，打开“数据与备份 → 导入备份 JSON”，选择本地生成的种子。已有页面时，先“导出备份”，再确认替换。
5. 点击“立即发布”。状态会依次显示正在创建构建、构建中、已发布；页面提供该次部署链接。
6. 核对 Pages 生产地址和 `menav-build.json`，其中 `revision` 应等于后台“已发布版本”。在构建期间继续编辑，成功后新编辑仍应显示待发布。

> 如果为公开站绑定自定义域，需要在 DNS 添加 CNAME 指向 `YOUR_PROJECT_NAME.pages.dev` 并开启 Proxied；否则域名会停在 pending，报 `CNAME record not set`。绑定接口需要 Zone/DNS 权限，只有 Pages 权限时无法完成证书验证，HTTPS 会返回 525。添加后在 Pages 项目的 Custom domains 中确认验证通过、证书 active。

发布以管理台操作为主：管理员登录后点击「立即发布」。AI 通过 Access 一次性 PIN（Email OTP）调用 `POST /api/rebuild` 需要浏览器自动化，且 Access 应用需启用 One-time PIN，不是默认路径。Worker 不注册定时任务。没有未发布修改时不会创建构建，也不会为刷新外部数据单独消耗 Pages 构建。发布耗时包含 Pages 排队、RSS 抓取及构建时间，并非固定 SLA。若发布完成后关闭了后台，已发布状态会在下次打开后台核对时更新。

发布创建 API 返回成功只代表受理。Worker 必须确认部署达到 `deploy/success`、成为项目当前生产部署，且产物 `menav-build.json` 的任务 id 和版本匹配，才推进已发布版本。构建失败保留原静态站和待发布内容；修好配置后在后台重试。请求结果不确定时先按任务标识恢复已有部署，避免重复构建。核对时 Pages API 返回明确 4xx（不含 408/429）会标记失败；任务超过 30 分钟未完成会释放发布槽，可按失败状态重试。

## 六、部署后检查清单

| 检查项         | 方法                           | 预期                            |
| -------------- | ------------------------------ | ------------------------------- |
| Worker 可访问  | 打开 Worker 域名               | 跳转 Access 登录                |
| 管理员登录     | 使用 Access 允许的账号         | 进入管理台                      |
| 后台数据       | 打开“数据与备份”               | 可导出、可导入                  |
| 种子导入       | 导入 `workers/.seed.json`      | 页面、分类、站点出现            |
| Pages 环境变量 | Pages 项目设置                 | 五个变量（其中两个 secret）齐全 |
| 首次发布       | 后台点击或 `POST /api/rebuild` | 状态依次到「已发布」            |
| 产物版本       | 访问 `/menav-build.json`       | `revision` 等于后台已发布版本   |
| 公开站匿名访问 | 退出登录后打开 Pages 域名      | 正常显示，不要求登录            |

## 七、本地开发

本地开发不需要 Cloudflare 资源：

```bash
npm ci
npm --prefix workers ci
npm run backend:init -- --with-local   # 生成 wrangler.local.jsonc 与 .dev.vars
npm run backend:seed                   # 生成 workers/.seed.json
npm run backend:dev:local              # 本地 Worker + 本地 D1
```

`wrangler.local.jsonc` 的 D1 绑定是 `remote: false`，数据保存在 `workers/.wrangler/`；删除该目录可重置本地数据库。`TEAM_DOMAIN`、`POLICY_AUD` 留空时，`.dev.vars` 必须设置 `ALLOW_INSECURE_DEV=1`；填写真实 Access 变量后按正常 JWT 模式放行。生产配置的必需值仍是占位符时会拒绝部署，但 `POLICY_AUD` 可以暂缺。

本地配置没有 `CF_ACCOUNT_ID`、`CF_PAGES_PROJECT`，管理台可编辑和导入数据，但发布功能不可用。需要验证发布链路时，改用生产配置或测试配置，并确认 D1 网络可用。

访问 Wrangler 输出的本地地址，打开“数据与备份 → 导入备份 JSON”，选择 `workers/.seed.json`。该鉴权放行接受 localhost、127.0.0.1、IPv6 本机地址，以及任意 `*.workers.dev` 主机；生产不要设置。

> `npm run backend:dev` 读取生产配置 `wrangler.jsonc`，D1 绑定是 `remote: true`，会直接读写远端数据库。只做只读调试或已确认目标 D1 时再用。

种子读取当前配置目录的导航、主题、字体、Markdown 正文、本地图片以及已有文章和项目数据。后续动态构建不读取这些仓库业务文件。后台「站点设置」支持加载并保存（`PUT /api/settings/site`）；仅「数据与备份 → 当前配置」为只读展示。页面、正文、分类与站点可直接编辑。

## 八、数据契约与升级

- `GET /api/state` 返回页面数组和 `ETag`；后台保存带 `If-Match`。带该头且其他窗口已修改时返回 409 并保留当前输入。
- 管理 API 的写操作带 `If-Match: <ETag>` 时校验并发，不带时跳过版本校验；后台前端始终发送该头。`POST /api/rebuild` 不参与内容版本校验。
- `PUT /api/settings/site` 的合并结果与当前配置相同时不递增 revision；空 patch 仍按 `If-Match` 校验并发。
- `GET /api/export` 导出 `{ schemaVersion, revision, updatedAt, settings, pages }`；可在“数据与备份”下载备份或导回。
- `POST /api/seed` 整体替换页面、分类、站点和配置。只要已有页面，必须 `?reset=1`，包括只有书签页面的情况。原备份的 revision 不会倒退当前库版本；恢复作为一次新编辑提交。
- `POST /api/bookmarks` 接收 `{ html }`。有效导入整体替换固定 `bookmarks` 页的分类和站点；其他页面保留。空或全为不安全 URL 的输入返回 422，原数据不变。MarksVault Service Token 直推不在本期范围。
- `hidden` 只隐藏导航，链接与搜索仍可访问。`foldable=false` 禁止收起该分类，未指定时保持静态站默认的可折叠行为。
- JSON 请求体最多 16 MB；书签 HTML 最多 8 MB；单条序列化导入记录最多约 900 KB、每类最多 8 MB；发布快照最多 8 MB。单张种子图片最多 500 KB（库内按 `asset:<path>` 独立成行，`GET /api/settings` 与导出仍返回单个 `assets` 对象）。超限返回明确错误，事务不部分写入。
- 批量导入使用 `json_each` 减少单 SQL 绑定参数，所有块仍在一个 `db.batch` 事务内。D1 的 100 参数限制针对单 SQL，不代表 batch 能无条件容纳 100 条语句；本实现将导入业务语句限制为 24 条，给 Free 每请求 50 次查询保留余量。拆分后的图片行同样占用该预算。
- 表升级只追加 metadata、navigation、kind 等列及版本/发布表。升级前先做 D1 导出备份，必要时用 D1 Time Travel 恢复（保留期以账号计划为准）。旧版本已丢失的正文、标题或图片无法由迁移凭空恢复，应从原种子重新导入或在后台补齐。
- 早期版本可能产生数字开头的 UUID 页面 id。发布会明确拒绝这类旧标识，数据仍保留并可导出。备份后将页面 id 改为 `page-<原 UUID>`，并修正指向 `?page=<原 id>` 的站内链接，再通过显式替换导入；不会自动改链接。

### 从旧配置升级

- 旧的 `wrangler.jsonc` 如果还保留 `env.staging`，现在不会再被读取；请删除该段，测试环境改用 `wrangler.test.jsonc`。
- 旧的本地调试方式是在生产 `wrangler.jsonc` 里清空 `TEAM_DOMAIN`、`POLICY_AUD` 再运行 `backend:dev`。现在请改用 `npm run backend:init -- --with-local` 与 `npm run backend:dev:local`；生产配置的必需值不会再被清空。
- 旧的 `wrangler.test.jsonc` 如果只包含 staging 段，可以保留；补一份同目录的 `wrangler.jsonc` 后会执行生产隔离比较，缺失时只警告。

## 九、构建与验证

从后台下载备份后，可用 `MENAV_SNAPSHOT_FILE` 指定本地 JSON，再运行 `npm run build:snapshot`。默认按快照中的地址刷新 RSS、GitHub 仓库统计与贡献图；每次构建使用独立临时缓存，失败来源保留 D1 中的数据。`npm run build:snapshot -- --offline` 只使用快照基线，适合复现产物差异。

```bash
npm run check
npm run format:check:changed
npm run backend:check
npm run backend:check:configs
npm run backend:test
npx playwright install chromium
npm --prefix workers run test:browser
node workers/test/snapshot-build.mjs
npm run test:browser
```

最后两个构建/浏览器命令会使用根目录 `dist/`，不要与其他构建并行。若使用本机 Chrome，可通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定其绝对路径。测试只使用临时 D1；外部刷新集成测试运行真实同步脚本并提供可控外站响应。

## 十、部署与运维

本节 wrangler 命令默认在 `workers/` 下执行，或使用 `npm --prefix workers exec -- wrangler ...`。

### 代码更新后的部署

仓库不配置自动部署，Worker 由维护者手动发布：

1. 在仓库根目录执行 `npm run backend:deploy`；测试环境执行 `npm run backend:deploy:test`。命令会先运行 `backend:doctor`，必需占位符未填时不会部署；`POLICY_AUD` 可以暂缺，补齐后再部署一次。
2. 公开站源码由 Pages 项目的生产分支提供。代码变化不改变 `revision`，需要**强制重建**：管理台点击「强制重建」（二次确认后调用 `POST /api/rebuild?force=1`），或直接调用该接口，让新代码进入公开站。
3. 确认 Pages 项目的 Git 自动部署已关闭。本设计通过 Worker 创建部署，Git push 触发的构建不会被发布任务认领。

> 不要依赖 Pages 控制台的 Git 自动部署：本设计的快照授权依据是「部署 URL 等于当前发布任务的部署」，Git push 触发的构建 URL 与之不符，必然失败。Git 仅作为源码提供方。

### 回滚

- **Worker**：`npx wrangler versions list` 查看历史，`npx wrangler rollback <version-id>` 回退。测试环境使用本地配置时补 `--config wrangler.test.jsonc --env staging`。
- **Pages**：`POST /accounts/{id}/pages/projects/{project}/deployments/{deployment_id}/rollback`，或控制台操作。
- ⚠️ Pages 回滚会移动 `canonical_deployment`，而 D1 的 `published_revision` 单调递增、**不会回退**，回滚后后台显示的「已发布」会与实际不一致，且若有在途任务会以「未成为当前生产版本」失败。建议回滚后同步用 D1 Time Travel 恢复到对应时间点，再重新发布一次以对齐版本标记。

回滚或发布后运行只读核对：

```bash
npm run backend:verify
npm run backend:verify -- --config wrangler.test.jsonc
```

脚本读取 Pages 的 `canonical_deployment`、该部署的 `/menav-build.json`，以及 D1 的 `content_state.published_revision` 和最近发布任务，比较 `revision`、`publicationId` 与部署 ID。需要 `CLOUDFLARE_API_TOKEN`（Pages Read，或复用 `CF_API_TOKEN`）；D1 通过 wrangler 读取（已 `wrangler login`，或 Token 具备 D1 读取权限）。以下情况以非 0 退出：产物 revision 与 `published_revision` 不一致、`publicationId` 缺失或不一致、没有发布任务记录、任务未处于 `published`、Pages 生产部署不是该任务的部署。脚本只报告问题，不改写 D1 或 Pages。对齐方式二选一：用 D1 Time Travel 恢复到与当前 Pages 产物匹配的版本后重新发布；或直接用「强制重建」把当前 D1 内容发布成新的 Pages 产物。

### 密钥轮换

三处凭证，轮换时都要更新并保持一致：

1. `BUILD_TOKEN`（Worker secret 与 Pages `MENAV_BUILD_TOKEN` 两处，缺一不可）；
2. `CF_API_TOKEN`（Worker secret，Pages Edit 权限）；
3. Access Service Token（到期前重建，把新 Client ID/Secret 配到 Pages）。

```bash
npx wrangler secret put BUILD_TOKEN
npx wrangler secret put CF_API_TOKEN
```

测试环境通过本地配置设置：`npx wrangler secret put BUILD_TOKEN --config wrangler.test.jsonc --env staging`，`CF_API_TOKEN` 同理。

`wrangler secret bulk` 可用一份 JSON/`.env` 批量更新。切勿把 Token 提交进仓库或写入文档。

### 故障恢复

- 查看日志：`npx wrangler tail --name <worker-name>`。
- 发布状态：`GET /api/publish-status` 返回 `wired / revision / publishedRevision / pending / job`（`job.status`：dispatching/building/published/failed）。
- 构建失败：后台状态栏显示失败原因并提供「重新发布」；冻结快照在重试时重新写入，不会部分残留。
- D1 恢复：`npx wrangler d1 time-travel info <d1-name>` / `restore`（Free 保留 7 天）；`restore` 为破坏性原地覆盖，先导出备份。
- 备份：`npx wrangler d1 export <d1-name> --remote --output=backup.sql`（导出期间会阻塞其他数据库请求，安排在低峰）。

## 十一、常见问题

| 现象                               | 原因                                      | 处理                                                                             |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| 本地 `wrangler dev` 改动了线上数据 | 用了生产配置，D1 绑定带 `remote: true`    | 改用 `npm run backend:dev:local`；需要远端库时先导出备份                         |
| 登录后台一直要求登录               | Access 的 `allow` 策略不认 Service Token  | 为构建路径使用 Service Auth（`decision: non_identity`）                          |
| 首次发布失败                       | Pages 环境变量或 Service Token 未配齐     | 对照第六节检查清单逐项核对                                                       |
| 发布后公开站没变化                 | 只改了 D1，没有新发布                     | 在后台点击「立即发布」，或用用户会话调用 `POST /api/rebuild`；代码变化需强制重建 |
| 部署前检查报占位符                 | `wrangler.jsonc` 仍是示例值               | 填入 D1 id、团队地址、账号与 Pages 项目名；AUD 可在 Access 创建后补齐            |
| Pages 构建提示 Node 版本不符       | 未设置 `NODE_VERSION`                     | 在 Pages 环境变量中设置 `NODE_VERSION=24`                                        |
| 后台看不到未发布状态               | 发布完成后关闭了后台                      | 下次打开后台会自动核对并更新                                                     |
| Pages 回滚后后台版本对不上         | D1 `published_revision` 不会随 Pages 回退 | 运行 `npm run backend:verify` 确认差异，再按第十节对齐 D1 与 Pages 产物          |
