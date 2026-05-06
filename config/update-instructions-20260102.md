# 更新说明（2026-01-02）

本文档用于说明 Issue #30（外部资源/图标/嵌套交互）相关改动中，**配置层面的新增字段、行为变更与迁移要点**。

关联 Issue：https://github.com/rbetree/menav/issues/30

最后更新：2026-01-02

---

## 1. 新增/扩展的配置字段

### 1.1 `site.yml -> icons.mode`（站点卡片图标模式 / 隐私）

用途：控制“站点卡片图标”的全局渲染方式。

取值：

- `favicon`：根据站点 URL 通过第三方服务加载站点 favicon（失败时回退到 Font Awesome 图标）
- `manual`：始终使用配置中的 Font Awesome 图标类名（不发起 favicon 外部请求）

注意：

- 该配置位于 `site.yml` 的 `icons:` 节点下（默认示例见 `config/_default/site.yml`）。
- 配置目录采用“完全替换”策略：若启用 `config/user/`，需要在 `config/user/site.yml` 中设置该字段才会生效。
- 切换后需要重新生成页面（`npm run build` / `npm run dev`）才能影响生成的 HTML。

示例：

```yml
# config/user/site.yml
icons:
  mode: manual
```

---

### 1.2 `pages/*.yml -> sites[].faviconUrl`（站点级自定义图标链接）

用途：为单个站点指定图标链接（可远程或本地相对路径），用于兜底“favicon 服务返回默认图标/网络不可达”等情况。

说明：

- `faviconUrl` 优先级最高：一旦设置，将直接使用该图片链接渲染图标。
- 本地路径建议以 `assets/` 开头；构建时会复制到静态产物同路径，便于离线/内网使用。

示例：

```yml
sites:
  - name: '内部系统'
    url: 'https://intranet.example/'
    faviconUrl: 'assets/icons/intranet.png'
```

---

### 1.3 `pages/*.yml -> sites[].forceIconMode`（站点级强制图标模式）

用途：强制该站点使用指定模式（不设置则跟随全局 `icons.mode`）。

取值：

- `favicon`：强制走 favicon（外部请求）
- `manual`：强制走手动图标（不发起 favicon 外部请求）

优先级：

- `faviconUrl` > `forceIconMode` > 全局 `icons.mode`

示例：

```yml
sites:
  - name: 'Ant Design'
    url: 'https://ant.design/'
    icon: 'fas fa-th'
    forceIconMode: manual
```

---

## 2. 行为变更与修复要点（无需迁移字段）

### 2.1 `icons.mode` 全局切换修复

修复点：此前 `site.yml` 中的 `icons` 没有被提升为顶层 `icons`，导致模板与运行时读取到的仍是默认 `favicon`。本次已修复，`site.yml -> icons.mode` 会被模板/运行时统一读取生效。

### 2.2 favicon 双域名回退（`.com` → `.cn`）

修复点：favicon 默认使用 `t3.gstatic.com`，失败时自动切换 `t3.gstatic.cn` 重试一次，提升国内网络可用性。

### 2.3 多级结构站点新标签页打开一致性

修复点：多级结构（`subcategories/groups/subgroups`）下站点默认值未递归补齐，导致 `external` 为 `undefined` 时不输出 `target="_blank"`。本次已在生成阶段递归补齐 `sites[].external` 默认 `true`（显式 `external: false` 保持同页打开）。

---

## 3. 迁移建议（从旧版本升级）

1. 若使用 `config/user/`：请在 `config/user/site.yml` 中设置 `icons.mode`，然后执行 `npm run build` 重新生成页面。
2. 若遇到某些站点 favicon 始终显示默认图标：建议对该站点配置 `forceIconMode: manual`（使用 Font Awesome）或提供 `faviconUrl` 指向可靠图片（远程或本地 `assets/`）。
