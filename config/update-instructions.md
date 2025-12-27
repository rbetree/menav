# 更新说明（兼容性移除 / 迁移指南）

本文档说明本次“页面模板差异化改进”阶段，在配置/构建链路上**移除的历史兼容行为**以及如何迁移。

最后更新：2025-12-27

---

## 1. 已移除的兼容行为（Breaking）

### 1.1 不再支持旧版单文件配置 `config.yml` / `config.yaml`

- 旧版本在未发现 `config/user/` 与 `config/_default/` 时，会回退读取根目录的 `config.yml` / `config.yaml`。
- 当前版本：仅支持模块化配置目录：
  - `config/user/`（优先级最高，完全替换）
  - `config/_default/`（默认示例）

迁移要点：
- 如果你只有 `config.yml`/`config.yaml`：请将其内容拆分到 `config/user/site.yml` 与 `config/user/pages/*.yml`。
- 推荐做法：先复制一份默认示例，再按需替换字段：
  1) 复制 `config/_default/` → `config/user/`
  2) 修改 `config/user/site.yml`、`config/user/pages/*.yml`

---

### 1.2 不再支持独立 `navigation.yml`

- 旧版本可能存在 `config/user/navigation.yml`（或 `_default/navigation.yml`）作为导航配置来源。
- 当前版本：导航仅从 `site.yml -> navigation` 读取；不再回退读取独立 `navigation.yml`。

迁移要点：
- 把原 `navigation.yml` 的数组内容移动到 `config/user/site.yml` 的 `navigation:` 字段下。
- 书签导入流程也只会更新 `config/user/site.yml`，不会再尝试写入/更新 `navigation.yml`。

---

### 1.3 不再支持 `pages/home.yml -> 顶层 config.categories` 与 `home` 子菜单特例

- 旧版本存在“首页写死叫 `home`”的遗留逻辑：
  - 若存在 `pages/home.yml`，会把其 `categories` 复制到顶层 `config.categories`
  - 生成导航子菜单时，若 `nav.id === 'home'`，会优先从 `config.categories` 取分类
- 当前版本：不再维护上述特殊字段/特例；子菜单统一从 `pages/<id>.yml` 的 `categories` 读取。

迁移要点：
- 不要依赖 `home` 这个固定 id。
- 首页始终由 `site.yml -> navigation` 的**第一项**决定；其分类应写在对应的 `pages/<homePageId>.yml` 中。

---

## 2. 快速迁移清单（建议按顺序执行）

1. 确保存在 `config/user/site.yml`
2. 确保 `config/user/site.yml` 内包含 `navigation:`（数组）
3. 确保每个 `navigation[].id`（除内置 `search-results`）都有对应的 `config/user/pages/<id>.yml`（可缺省，但缺省时页面内容为空）
4. 若你曾使用 `config.yml/config.yaml`：将其内容迁移到模块化目录
5. 若你曾使用 `navigation.yml`：迁移到 `site.yml -> navigation`，并删除 `navigation.yml`（可选）

> 提示：配置采用“完全替换”策略，一旦存在 `config/user/` 就不会回退到 `config/_default/` 补齐缺失项。

