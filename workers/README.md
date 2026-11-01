# 动态后台部署与维护

动态后台使用 Worker + D1 + Access。公开站由专属 Pages Git 项目运行 Astro 构建，部署静态 `dist/`。Pages 只从 Git 获取应用源码，业务输入由 Worker 为每次发布冻结到 D1。

本地 API、真实 SQLite/D1 事务、JWT、管理台浏览器、HTTP 领取冻结快照和 D1 → Astro 构建均有自动化验证。真实 Access 登录、Cloudflare 账号配额和线上发布时间需要部署后验收。

## 一、本地运行

在仓库根目录执行：

```bash
npm ci
npm --prefix workers ci
# 复制 workers/wrangler.example.jsonc 为 workers/wrangler.jsonc，并填写自己的 Cloudflare 资源
npm run backend:seed
```

复制 `workers/.dev.vars.example` 为 `workers/.dev.vars`，然后执行 `npm run backend:dev`：

```dotenv
ALLOW_INSECURE_DEV=1
```

访问 Wrangler 输出的本地地址，打开“数据与备份 → 导入备份 JSON”，选择 `workers/.seed.json`。该鉴权放行仅接受 localhost、127.0.0.1、IPv6 本机地址，以及 `wrangler dev` 暴露的 `.workers.dev` 主机（新版 Wrangler 下 `c.req.url` 的 host 是 workers.dev 域名）；生产不要设置。

> ⚠️ `wrangler.jsonc`（从示例复制）的 D1 绑定带 `remote: true`，本地 `wrangler dev` 会**连接远端库并写入真实数据**。仅做只读调试可直接运行；需要在本地撰写数据时，先 `npx wrangler d1 export` 备份，或用一份独立 D1。

种子读取当前配置目录的导航、主题、字体、Markdown 正文、本地图片以及已有文章和项目数据。后续动态构建不读取这些仓库业务文件。后台的配置展示为只读；页面、正文、分类与站点可直接编辑。

## 二、Cloudflare 资源与凭证

使用独立的后台域名和公开站 Pages 项目，避免影响已有静态站。以下命令会创建或更新真实云资源，应在确认目标账号后执行。

在 `workers/` 目录运行 `npx wrangler d1 create menav-db`，把返回的 `database_id` 填入本地 `wrangler.jsonc`（从 `wrangler.example.jsonc` 复制）或 `wrangler.test.jsonc` 的对应绑定。Worker 首次运行自动创建或增量升级表，不清空业务数据。

> 仓库只提交 `wrangler.example.jsonc`。`wrangler.jsonc`、`wrangler.local.jsonc` 与 `wrangler.test.jsonc` 都不入库；部署前脚本会检查占位符。测试环境部署使用 `npm --prefix workers run deploy:test`。

| 位置 | 配置 | 用途 |
| --- | --- | --- |
| Worker vars | `TEAM_DOMAIN` | 完整 Access 团队地址，如 `https://team.cloudflareaccess.com`，不带结尾斜杠 |
| Worker vars | `POLICY_AUD` | 管理后台 Access 应用的 AUD |
| Worker vars | `CF_ACCOUNT_ID` | Pages 所在账号 id |
| Worker vars | `CF_PAGES_PROJECT` | 动态公开站的 Pages 项目名 |
| Worker secret | `CF_API_TOKEN` | 目标账号的 Cloudflare Pages 编辑权限，用于创建和读取部署 |
| Worker secret | `BUILD_TOKEN` | 足够长的随机构建读取凭证，与 Pages 的值相同 |
| Pages 生产环境 | `MENAV_BACKEND_URL` | 可访问 Worker 的 HTTPS 地址 |
| Pages 生产环境 secret | `MENAV_BUILD_TOKEN` | 对应 Worker `BUILD_TOKEN` |
| Pages 生产环境 | `CF_ACCESS_CLIENT_ID` | Access Service Token 的 Client ID（若后台启用 Access） |
| Pages 生产环境 secret | `CF_ACCESS_CLIENT_SECRET` | 对应 Service Token 的 Client Secret |
| Pages 生产环境 | `NODE_VERSION=24` | 与仓库 CI 一致的 Node 版本 |

Worker 密钥在 `workers/` 下通过交互输入保存，勿写入源码：

```bash
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put BUILD_TOKEN
```

`CF_PAGES_URL` 是 Pages 自动提供的本次部署 URL，不手工填写。构建 Token 只能领取当前部署的冻结快照，不能写管理 API。Cloudflare API Token 始终保留在 Worker，不进入快照。

## 三、Access 与管理台

1. 为后台域名创建 Access Self-hosted 应用，策略仅允许管理员身份。
2. 管理台全部静态资源（`/`、`/index.html`、`/app.js`、`/style.css`、`/vendor/*`、`/icons/*`）和管理 `/api/*` 走该应用。Worker 再验证 JWT 的签名、issuer、audience 和过期时间；从 `workers.dev` 直连也不能绕过验证。后台响应统一设置 `Cache-Control: no-store`。
3. `/build/snapshot` 需要独立 Bearer 凭证到达 Worker。实测可行做法：在 Access 应用内新增一条 **Service Auth（`decision: non_identity`）** 策略，Include 选 `Any Access Service Token`；再建一个 Service Token，把其 Client ID/Secret 配到 Pages 构建环境（`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`），`build-snapshot` 会在请求里带上这两个头。Worker 仍执行构建 Token 校验。注意：Access 策略的 `exclude` 语义是「拒绝」而非「放行」，且 `allow` 策略即使带 Service Token 也会要求登录——必须用 Service Auth 才能让服务身份免登录通过。
4. 公开站使用 Pages 的独立域名，保持匿名访问。
5. 在仓库根目录执行 `npm --prefix workers run deploy`（使用填好的 `wrangler.jsonc`）；测试环境使用 `npm --prefix workers run deploy:test`（读取本机 `wrangler.test.jsonc`）。`admin/` 静态资源通过 Wrangler ASSETS 随 Worker 一起部署，包括图标选择器依赖的 Font Awesome 字体与图标清单；`run_worker_first` 保证资源返回前先鉴权。

不要把完整 `/api/*` 设为 Bypass。后台与写 API 都经过 Access；公开站始终消费已构建的静态产物。

## 四、Pages 与首次发布顺序

1. 创建连接本仓库的 **Pages Git 项目**，选择包含动态后台代码的生产分支。根目录为仓库根目录，构建命令 `npm run build:snapshot`，输出目录 `dist`。
2. 配置上一节的 Pages 生产环境变量和密钥，可复制 `workers/pages.env.example` 逐项填写；关闭 Git 提交触发的生产自动部署及预览分支自动部署。保留 Git 源码访问，部署由 Worker 调用 Pages API 发起。
3. 项目创建时的自动首构建没有对应发布任务，会因缺少快照失败；不会更新公开内容。完成配置后通过后台发起首次发布，不使用 Pages 控制台的重试按钮代替。
4. 登录已部署的后台，打开“数据与备份 → 导入备份 JSON”，选择本地生成的种子。已有页面时，先“导出备份”，再确认替换。
5. 点击“立即发布”。状态会依次显示正在创建构建、构建中、已发布；页面提供该次部署链接。
6. 核对 Pages 生产地址和 `menav-build.json`，其中 `revision` 应等于后台“已发布版本”。在构建期间继续编辑，成功后新编辑仍应显示待发布。

发布只由管理员在后台点击「立即发布」触发，Worker 不注册定时任务。没有未发布修改时不会创建构建，也不会为刷新外部数据单独消耗 Pages 构建。发布耗时包含 Pages 排队、RSS 抓取及构建时间，并非固定 SLA。若发布完成后关闭了后台，已发布状态会在下次打开后台核对时更新。

发布创建 API 返回成功只代表受理。Worker 必须确认部署达到 `deploy/success`、成为项目当前生产部署，且产物 `menav-build.json` 的任务 id 和版本匹配，才推进已发布版本。构建失败保留原静态站和待发布内容；修好配置后在后台重试。请求结果不确定时先按任务标识恢复已有部署，避免重复构建。

## 五、数据契约与升级

- `GET /api/state` 返回页面数组和 `ETag`；后台保存发送 `If-Match`。其他窗口已修改时返回 409 并保留当前输入。
- `GET /api/export` 导出 `{ schemaVersion, revision, updatedAt, settings, pages }`；可在“数据与备份”下载备份或导回。
- `POST /api/seed` 整体替换页面、分类、站点和配置。只要已有页面，必须 `?reset=1`，包括只有书签页面的情况。原备份的 revision 不会倒退当前库版本；恢复作为一次新编辑提交。
- `POST /api/bookmarks` 接收 `{ html }`。有效导入整体替换固定 `bookmarks` 页的分类和站点；其他页面保留。空或全为不安全 URL 的输入返回 422，原数据不变。MarksVault Service Token 直推不在本期范围。
- `hidden` 只隐藏导航，链接与搜索仍可访问。`foldable=false` 禁止收起该分类，未指定时保持静态站默认的可折叠行为。
- JSON 请求体最多 16 MB；书签 HTML 最多 8 MB；单条序列化导入记录最多约 900 KB、每类最多 8 MB；发布快照最多 8 MB。单张种子图片最多 500 KB。超限返回明确错误，事务不部分写入。
- 批量导入使用 `json_each` 减少单 SQL 绑定参数，所有块仍在一个 `db.batch` 事务内。D1 的 100 参数限制针对单 SQL，不代表 batch 能无条件容纳 100 条语句；本实现将导入业务语句限制为 24 条，给 Free 每请求 50 次查询保留余量。
- 表升级只追加 metadata、navigation、kind 等列及版本/发布表。升级前先做 D1 导出备份，必要时用 D1 Time Travel 恢复（保留期以账号计划为准）。旧版本已丢失的正文、标题或图片无法由迁移凭空恢复，应从原种子重新导入或在后台补齐。
- 早期版本可能产生数字开头的 UUID 页面 id。发布会明确拒绝这类旧标识，数据仍保留并可导出。备份后将页面 id 改为 `page-<原 UUID>`，并修正指向 `?page=<原 id>` 的站内链接，再通过显式替换导入；不会自动改链接。

## 六、构建与验证

从后台下载备份后，可用 `MENAV_SNAPSHOT_FILE` 指定本地 JSON，再运行 `npm run build:snapshot`。默认按快照中的地址刷新 RSS、GitHub 仓库统计与贡献图；每次构建使用独立临时缓存，失败来源保留 D1 中的数据。`npm run build:snapshot -- --offline` 只使用快照基线，适合复现产物差异。

```bash
npm run check
npm run format:check:changed
npm run backend:check
npm run backend:test
npx playwright install chromium
npm --prefix workers run test:browser
node workers/test/snapshot-build.mjs
npm run test:browser
```

最后两个构建/浏览器命令会使用根目录 `dist/`，不要与其他构建并行。若使用本机 Chrome，可通过 `PLAYWRIGHT_EXECUTABLE_PATH` 指定其绝对路径。测试只使用临时 D1；外部刷新集成测试运行真实同步脚本并提供可控外站响应，不能替代 Cloudflare 线上验收。

## 七、部署与运维

### 代码更新后的部署

仓库不配置自动部署，Worker 由维护者手动发布：

1. 在 `workers/` 下执行 `npm run deploy`；测试环境执行 `npm run deploy:test`。部署前脚本会检查配置，发现占位符或缺少本地配置时直接退出。
2. 公开站源码由 Pages 项目的生产分支提供。代码变化不改变 `revision`，需要**强制重建**：`POST /api/rebuild?force=1`，让新代码进入公开站。
3. 确认 Pages 项目的 Git 自动部署已关闭。本设计通过 Worker 创建部署，Git push 触发的构建不会被发布任务认领。

> 不要依赖 Pages 控制台的 Git 自动部署：本设计的快照授权依据是「部署 URL 等于当前发布任务的部署」，Git push 触发的构建 URL 与之不符，必然失败。Git 仅作为源码提供方。

### 回滚

- **Worker**：`npx wrangler versions list` 查看历史，`npx wrangler rollback <version-id>` 回退。测试环境使用本地配置时补 `--config wrangler.test.jsonc --env staging`。
- **Pages**：`POST /accounts/{id}/pages/projects/{project}/deployments/{deployment_id}/rollback`，或控制台操作。
- ⚠️ Pages 回滚会移动 `canonical_deployment`，而 D1 的 `published_revision` 单调递增、**不会回退**，回滚后后台显示的「已发布」会与实际不一致，且若有在途任务会以「未成为当前生产版本」失败。建议回滚后同步用 D1 Time Travel 恢复到对应时间点，再重新发布一次以对齐版本标记。

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
