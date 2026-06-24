# Runbook — 合 F0 → 并行 ③/F1 → 依次合入(Windows / E:\0.M-Next)

> 在你本机仓库执行(沙箱 git 是坏的,不能代跑)。验证总入口 `corepack pnpm verify`,后接 `node scripts/check-no-skipped.mjs` 守 `Skipped:0`。Docker 要可用(testcontainers)。**两个分支的 server e2e 不要同时跑**(端口/容器争用)。

## 0. 预检
```bat
cd /d E:\0.M-Next
git status                         &:: 工作树应只有未跟踪的 docs,勿 stage
git branch --list feat/T-V33-*     &:: 确认 f0 / f1 / view-templates-a / f4 分支在
git log --oneline -1 main          &:: 记下当前 main(应已含 F4 的 a37c2c9)
```

## 1. 合 F0(已核验:加法迁移 V21、转换走命令入口、Skipped:0)
```bat
git switch main
git merge --no-ff feat/T-V33-plugin-f0 -m "merge: feat/T-V33-plugin-f0 (T-V33-PLUGIN-F0)"
corepack pnpm install
corepack pnpm verify
node scripts/check-no-skipped.mjs
```
绿了即 F0 在 main。失败则 `git merge --abort` 或排查后重来,**勿带问题继续**。

## 2. ③ 模板目录扩展(基于含 F0 的 main)
分支此前从旧 main 建过且为空 —— 先并入含 F0 的 main,再实现:
```bat
git switch feat/T-V33-view-templates-a
git merge main -m "merge main (F0) into view-templates-a"
```
按 `docs/tasks/T-V33-VIEW-TEMPLATES-A-模板目录端点.md`(扩展卡)实现:
- 在 **F0 已建的** `packages/server/src/main/java/com/mnext/server/TemplateCatalogController.java` 上**扩** `publishedAt` + `typeOverview`(对象类型 `[{code,name}]`,**≤20 截断标记**)+ `description`(无列→`null`);
- 加 TS 客户端 `packages/views/src/api/view-client.ts` 的 `templates()`;新增富字段集成测试。
- **勿重建控制器、勿动 published-only/最高版本/排除 withdrawn 逻辑。**

验证 + 提交(**不合并**):
```bat
corepack pnpm verify
node scripts/check-no-skipped.mjs
git add -A
git commit -m "feat(server): templates catalog rich fields + ts client (T-V33-VIEW-TEMPLATES-A)"
git diff --stat main
```

## 3. F1 ProfileLoader(基于含 F0 的 main,与第2步错峰跑 e2e)
```bat
git switch feat/T-V33-plugin-f1
git merge main -m "merge main (F0) into plugin-f1"
```
按 `docs/tasks/T-V33-PLUGIN-F1-profile装载器.md` 实现:
- 声明式 `ProfileManifest` + `ProfileLoader.install`(幂等、原子);
- `uninstall` 调 **F0 的** `withdrawTemplateVersion`、重装调 `restoreTemplateVersion`(本卡不再自处理撤下状态);
- 装载只按序发已有 tpl-api 命令;**不改命令/事件契约、不改求值逻辑、不加业务迁移**;
- 命中"需改契约/需新迁移/定义命令取不到 service" → **停下回报,不夹带**。

验证 + 提交(**不合并**):
```bat
corepack pnpm verify
node scripts/check-no-skipped.mjs
git add -A
git commit -m "feat(server): profile loader install/uninstall (T-V33-PLUGIN-F1)"
git diff --stat main
```

## 4. 回报(把这几行贴回给我核验,我通过再合)
- ③:`git diff --stat main` + verify 汇总 + `Skipped:0` + view-client `templates()` 用例结果。
- F1:`git diff --stat main` + verify 汇总 + `Skipped:0` + 装/卸/重装关键断言(卸后目录不含、老工作空间仍可用、重装恢复)。

## 5. 依次合入(我核验通过后)
```bat
:: ③ 先合
git switch main
git merge --no-ff feat/T-V33-view-templates-a -m "merge: feat/T-V33-view-templates-a (T-V33-VIEW-TEMPLATES-A)"
corepack pnpm verify && node scripts/check-no-skipped.mjs

:: F1 再合(基线已动,先把 main 并进 F1 再合,避免冲突)
git switch feat/T-V33-plugin-f1
git merge main -m "merge main (③) into plugin-f1"
:: (如有冲突,解后 corepack pnpm verify 复绿再继续)
git switch main
git merge --no-ff feat/T-V33-plugin-f1 -m "merge: feat/T-V33-plugin-f1 (T-V33-PLUGIN-F1)"
corepack pnpm verify && node scripts/check-no-skipped.mjs
```

## 6. 下一步(F0+F1+F4+③ 都在 main 后)
从含四者的 main 起 `feat/T-V33-plugin-interior`,按 `T-V33-PLUGIN-INTERIOR-室内设计首个插件.md`(domains 包 + 清单 + 注册风/光 + 装卸 E2E)。

---
### 备忘
- Windows 无 `grep` → 用 `findstr` / `Select-String`。
- `git worktree remove` 被 vite/Codex 占用失败 → `--force` + `git worktree prune`。
- postgres `Connection refused` 刷屏 + "Surefire kill self fork JVM" = testcontainers 拆容器善意噪声;`@charset`/661kB chunk = vite 善意告警 —— 非失败。
- `corepack pnpm verify` 已含 architecture/contracts/format/lint/typecheck/test(含 maven verify e2e)/build 全链。
