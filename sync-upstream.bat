@echo off
echo 正在执行新的同步策略...

REM 保存当前分支
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i

echo 当前分支: %CURRENT_BRANCH%

REM 步骤1: 切换到main分支并获取上游更新
echo 步骤1: 获取原仓库最新更新...
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

REM 步骤2: 尝试合并handsomezhuzhu分支到main
echo 步骤2: 合并个性化配置到main分支...
git merge handsomezhuzhu

REM 步骤3: 推送更新后的main分支
echo 步骤3: 推送更新后的main分支...
git push origin main

REM 步骤4: 重置handsomezhuzhu分支为最新main
echo 步骤4: 重置handsomezhuzhu分支...
git checkout handsomezhuzhu
git reset --hard main
git push origin handsomezhuzhu --force

REM 切换回原分支
git checkout %CURRENT_BRANCH%

echo 同步完成！
echo 当前分支: %CURRENT_BRANCH%
echo main分支现在包含: 原仓库最新代码 + 你的个性化配置
echo handsomezhuzhu分支已重置为最新main分支
pause
