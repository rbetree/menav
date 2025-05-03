# 开发工作流程指南

本文档描述了项目的开发和发布流程，特别是如何进行渐进式开发但控制发布时机。

## 分支策略

本项目采用以下分支策略：

- `main` - 生产分支，与线上部署同步
- `dev` - 开发分支，用于积累功能更新

## 日常开发流程

### 1. 确保在开发分支上工作

开始工作前，确保您在 `dev` 分支上：

```bash
# 检查当前分支
git branch

# 如果不在dev分支，切换到dev分支
git checkout dev
```

### 2. 完成小功能后提交到开发分支

每完成一个小功能或修复后，提交到开发分支：

```bash
# 添加修改的文件
git add .

# 提交更改，使用清晰的提交信息
git commit -m "添加：XXX功能" 

# 推送到远程开发分支
git push origin dev
```

这些更改会被保存在 GitHub 仓库中，但不会触发网站部署。

### 3. 功能累积到一定程度后发布

当您认为积累了足够的更新，可以进行一次正式发布：

```bash
# 确保开发分支是最新的
git checkout dev
git pull origin dev

# 切换到main分支
git checkout main

# 将dev分支合并到main
git merge dev

# 推送到远程main分支，触发部署
git push origin main
```

推送到 `main` 分支后，GitHub Actions 会自动触发构建和部署流程。

### 4. 手动触发部署（可选）

如果需要手动触发部署，可以在 GitHub 仓库页面的 "Actions" 选项卡中选择 "Build and Deploy Site" 工作流，并点击 "Run workflow" 按钮。

## 注意事项

1. 请确保在合并到 `main` 分支前，所有功能在 `dev` 分支上已经经过充分测试
2. 建议定期将 `main` 分支的更改合并回 `dev` 分支，以保持同步
3. 如果有多人协作，建议为每个功能创建单独的特性分支，然后合并到 `dev` 分支 