# MeNav 项目约定

## 分支与合并

- `dev` 是长期维护分支。功能、修复、文档和依赖更新都先合入 `dev`。
- `main` 只接受来自 `dev` 的 PR，不直接向 `main` 提交。
- 开发分支从 `dev` 切出，完成后合并回 `dev` 并删除，不保留为长期维护分支。
- 发布流程：`dev` 验证通过后开 PR 到 `main`，合并即触发 Pages 部署和镜像发布。
- 合并到 `main` 前确认 PR 的 CI 通过。`main` 的 push 会触发 `deploy.yml`、`docker-ghcr.yml` 和 `codeql.yml`。

## 提交前检查

- 改动完成后至少运行 `npm run check`。
- 涉及 workers 时，额外运行 `npm --prefix workers run check` 和 `npm run backend:test`。

## 依赖与安全

- 依赖升级优先通过 Dependabot PR 进入 `dev`；需要手动升级时同样走分支 → `dev`。
- 安全告警修复后复查 `npm audit --omit=dev --audit-level=high` 和 `npm --prefix workers audit --omit=dev --audit-level=high`。
