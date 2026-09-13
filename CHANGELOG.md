# 更新记录

> 本文件维护 MeNav 历史更新记录。README 不再维护"更新记录"章节。

### Unreleased（feat/dynamic-backend 分支）

**1. 动态后端（形态二）**

- 新增 `workers/` 子项目：Cloudflare Worker + D1 动态后台（Hono 路由 + Access JWT 校验），提供页面/分类/站点 CRUD、批量排序、书签导入、种子导入与手动发布 API
- D1 保存导航、正文、元数据、配置、图片和外部数据基线，种子整体替换需显式确认；大批量导入及版本递增在同一事务提交
- 新增 `admin/` 管理控制台，随 Worker 部署并受 Access 保护，支持在线编辑、上下移动排序、四层分类调整、书签粘贴/上传、备份恢复、配置查看与发布状态
- 页面隐藏仅影响导航，链接和搜索仍可访问；可选字段可清空，跨窗口版本冲突保留当前输入；分类折叠开关与混合排序在公开站生效
- 新增 `build:snapshot`，D1 JSON 复用现有 Astro 渲染；Pages 可读取 Git 应用代码，业务数据不读取仓库 YAML、Markdown 或缓存
- 构建按 D1 配置刷新文章、GitHub 统计与贡献图，使用独立临时缓存；部分刷新失败保留对应来源的 D1 数据
- Pages API 发布冻结版本，核对生产部署及产物标记后才推进已发布版本；每 5 分钟检查待发布修改，构建期间编辑与失败重试不丢更新
- 新增隔离 D1 集成测试、管理台浏览器测试与完整快照构建对比，接入 CI；生产 Access 和线上发布时延仍需部署后验收
- 将开发工具的传递依赖 `fast-uri` 固定到 3.1.6，修复 URL 规范化相关高危审计项

**2. 书签解析核心抽取**

- 书签解析逻辑抽为 `src/lib/bookmarks/parser-core.ts` 共享核心（纯 JS、零 Node API、logger 可注入），形态一 `parser.ts` 与形态二 Worker 共用同一实现，解析语义一致
- `parser.ts` 保留为形态一门面，历史 `require()` 接口不变，形态一零改动

### 2026/01/04

**1. 首屏性能优化**

- 移除首页副标题固定 Quicksand 外链字体，改为跟随全站字体
- 字体外链 CSS 支持 `fonts.preload: true`（`preload + onload` 非阻塞加载，含 `<noscript>` 回退）
- Font Awesome CSS 改为 `preload + onload` 非阻塞加载，降低 render-blocking 影响
- 构建阶段压缩 `style.css` / `script.js` / `pinyin-match.js`，减少传输体积

**2. 安全与部署稳定性**

- 链接安全加固：模板与运行时统一校验 URL scheme（不安全链接降级为 `#`），新增 `security.allowedSchemes` 支持显式放行自定义协议
- 去除外部输入的 `innerHTML` 拼接：分类标题更新/新增分类改用 DOM API 构建，降低注入风险
- `sync-articles` 对齐 best-effort：同步失败不再以非 0 退出码阻断构建/部署
- 版本号来源统一：`window.MeNav.version` 不再写死，自动读取构建注入版本（用于扩展/调试识别）

**3. 模板图标 helper（Breaking）**

- 模板 helper `faviconUrl` 更名为 `faviconV2Url`，避免与站点字段 `sites[].faviconUrl` 同名冲突；如有自定义模板调用 `{{faviconUrl url}}`，需同步改为 `{{faviconV2Url url}}`

### 2026/01/03

关联 Issue：[#31](https://github.com/rbetree/menav/issues/31)

**1. favicon 加载优化**

- 新增 `icons.region: com | cn` 配置项，允许用户选择优先使用国内源或国外源
  - `com`（默认）：优先 gstatic.com，失败回退 gstatic.cn
  - `cn`：优先 gstatic.cn，失败回退 gstatic.com
- 修改 favicon 加载超时判断机制
  - 自定义 faviconUrl：5秒超时后显示回退图标
  - 自动 favicon：每次尝试3秒超时，最多等待6秒
  - 避免网络慢时长时间显示加载动画

### 2026/01/02

关联 Issue：[#30](https://github.com/rbetree/menav/issues/30)

细节见：[`config/update-instructions-20260102.md`](config/update-instructions-20260102.md)

**1. 外部资源可用性**

- Font Awesome：bootcdn → cdnjs（Cloudflare），降低被拦截风险
- favicon：`t3.gstatic.com` 失败自动回退 `t3.gstatic.cn`，提升国内网络可用性

**2. 图标模式与站点级覆盖**

- 修复 `site.yml -> icons.mode` 配置未生效（构建期提升为顶层 `icons.mode`，供模板/运行时统一读取）
- 新增站点级图标覆盖：`faviconUrl` / `forceIconMode: favicon | manual`（优先级：`faviconUrl` > `forceIconMode` > 全局 `icons.mode`）

**3. 嵌套交互与链接打开**

- 恢复二级分组折叠入口（桌面端默认隐藏，悬停/收起态显示，避免界面过密）
- 多级结构下递归补齐 `sites[].external` 默认值，保证站点链接默认新标签页打开

### 2025/12/27

细节见：[`config/update-instructions-20251227.md`](config/update-instructions-20251227.md)

**1. 页面模板差异化改进（Phase 1/Phase 2）**

- 首页判定规则调整：`site.yml -> navigation` 第一项即首页（不再依赖 `home` 页面/ID）
- 模板体系整理：通用 `page` + 特殊页 `projects/articles/bookmarks` + 内置 `search-results`
- `bookmarks` 标题后追加只读更新时间：`update: YYYY-MM-DD | from: git|mtime`
- `articles` Phase 2：RSS 聚合文章条目（只读 `data-type="article"`），按 `articles.yml` 分类聚合展示；保留隐藏写回结构避免干扰扩展
- `projects`：repo 风格卡片（language/stars/forks 自动抓取）+ 可选 GitHub 贡献热力图

**2. 工作流与时效性数据刷新**

- GitHub Actions 构建前自动执行 `sync-projects` / `sync-articles`
- 新增 `schedule` 定时触发刷新（cron 使用 UTC，可在 workflow 中调整）

**3. 配置与兼容清理（Breaking）**

- 移除旧版单文件配置 `config.yml/config.yaml` 回退
- 移除独立 `navigation.yml` 回退
- 移除 `pages/home.yml -> 顶层 categories` 与 `home` 子菜单特例
- `navigation[].active` 不再生效（首页/默认打开页始终由 `navigation` 第一项决定）

**4. 配置变更（字段新增/减少）**

- 新增：
  - `site.rss.*`：articles RSS 抓取与缓存配置（用于 `npm run sync-articles`）
  - `site.github.*`：projects 热力图与仓库元信息抓取缓存配置（用于 `npm run sync-projects`）
  - `pages/<id>.yml -> template`：页面模板选择（缺省时按回退规则使用 `page`）
- 说明：
  - “首页”始终由 `site.yml -> navigation` 第一项决定，不要求页面 id 为 `home`

### 2025/12/23

**1. 侧边栏与导航交互优化**

- 高亮项有子菜单时会自动展开
- 侧边栏 `logo_text` 左侧展示站点 Logo（复用 `site.favicon`）

**2. 卡片层级折叠规则调整**

- 仅 1 层分类：一级分类支持下拉/收起
- 2/3 层分类：仅二级标题支持下拉/收起（一级/三级不提供折叠按钮与交互）

**3.页面细节**

- 主题蓝调整为 `#7694B9`，统一应用到高亮/渐变/阴影
- 搜索无结果红色状态图标对齐修复（避免图标位置偏移）
- `menav.svg` 优化暗色背景可读性（字母颜色加深）

### 2025/11/09

**1. 默认配置与文档**

- 更新默认配置与项目 Logo，并同步完善 README

### 2025/10/31

**1. 书签导入与嵌套结构**

- 优化书签转换逻辑与分类嵌套结构
- 修复书签转换脚本问题，提升稳定性

### 2025/10/24 - 2025/10/27

**1. 分类/卡片交互与细节修复**

- 为各结构补齐下拉指示与交互，并新增“分类展开/收起”按钮
- 修复侧边栏切换图标错位、站点卡片悬浮层级遮挡问题
- 调整卡片间距与 category/group 栏样式效果，移除废弃的 `restructure` 命令

### 2025/10/18

**1. 图标模式默认行为变更**

- 默认启用 `icons.mode: favicon`，自动根据站点 URL 加载 favicon（失败回退为 Font Awesome 图标）
- 如需关闭外部请求并完全使用手动图标，请在 `config/user/site.yml` 中设置：

```yaml
# config/user/site.yml
icons:
  mode: manual # 关闭 favicon 请求，纯手动图标
```

### 2025/10/14

**1. 拼音搜索支持**

- 支持中文拼音与首字母匹配检索（基于 `pinyin-match`）

### 2025/07/30

**1. 链接打开行为一致性**

- 统一站点/导航外链为新标签页打开，改善导航体验

### 2025/07/07

**1. UI 细节优化**

- 侧边栏显示与布局细节优化
- 明暗主题切换按钮样式改进
- 欢迎文本与布局对齐优化

### 2025/05/22

**1. MeNav 浏览器扩展支持接口**

- 注入扩展元信息（`menav-config-data`）并输出 `dist/menav-config.json` 供扩展按需加载（避免把整站配置注入到 `index.html`）
- 暴露 `window.MeNav` 基础能力与 DOM 数据属性，支持元素精准定位与更新
- 为扩展推送与页面联动打通基础能力

### 2025/05/16

**1. MarksVault 浏览器扩展集成**

- 支持与 [MarksVault](https://github.com/rbetree/MarksVault) 浏览器扩展集成
- 使用扩展自动推送书签文件到 MeNav
- 自动处理推送的书签文件并更新网站

### 2025/05/09

**1. 搜索引擎集成功能**

- 集成Google、Bing、百度搜索引擎
- 通过搜索框图标一键切换不同搜索引擎
- 用户选择保存在本地，下次访问自动应用

### 2025/05/08

**1. Handlebars模板系统重构**

- 使用Handlebars模板引擎重构整个前端生成系统
- 实现模块化、组件化的模板结构，包含layouts、pages和components
- 改进代码复用，提高可维护性和扩展性
- 优化HTML生成逻辑，提升性能和代码质量

### 2025/05/04

**1. 移除双文件配置支持**

- 完全移除了对双文件配置方法的支持
- 简化了配置加载逻辑，现在仅支持模块化配置

### 2025/05/03

**1. 侧边栏收回功能**

- 添加侧边栏折叠/展开按钮，位于Logo文本右侧
- 侧边栏平滑折叠/展开过渡

**2. 移动端UI优化**

- 修复搜索按钮和侧边栏按钮遮挡问题
- 点击侧边栏导航项后自动收起侧边栏

### 2025/05/02

**1. 模块化配置**

- 支持将配置拆分为多个文件，便于管理和维护
- 引入配置目录结构，分离页面配置
- 配置统一采用模块化目录结构（`config/user/` / `config/_default/`）

### 2025/05/01

**1. 页面布局优化**

- 优化了内容区域和侧边栏的间距，确保各种分辨率下内容不会贴近边缘
- 卡片与边框始终保持合理间距，避免在窄屏设备上与滚动条贴边
- 调整了搜索结果区域的边距，与常规分类保持样式一致性

**2. 网站卡片文本优化**

- 为站点卡片标题添加单行文本截断，过长标题显示省略号
- 为站点描述添加两行限制和省略号，保持卡片布局整洁
- 添加卡片悬停提示，方便查看完整信息

**3. 移动端显示增强**

- 优化了移动端卡片尺寸，一屏可显示更多网址
- 图标大小自适应，在小屏幕上更加紧凑
- 为不同尺寸移动设备（768px、480px、400px）提供递进式UI优化
- 减小卡片内边距和元素间距，增加屏幕利用率

**4. 书签导入功能**

- 支持从Chrome、Firefox和Edge浏览器导入HTML格式书签
- 自动处理书签文件，解析文件夹结构和链接
- 图标处理：默认加载站点 favicon；在 manual 模式下保留 Font Awesome 匹配
- 生成配置文件，无需手动录入即可批量导入网站链接
- 与GitHub Actions集成，全自动化的导入和部署流程
