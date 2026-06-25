# Codex 下发提示词 — T-V33-VIEW-RELVER-A(关系版本读侧投影)

## 前置
- 本卡**不需要** spec-change(纯读侧加性,不动迁移/契约)。若 Codex 发现需要迁移或改契约 → 按卡内要求停下回报,**不要**自行改。
- 用独立 git worktree,勿与其它会话共用工作树:
  ```bash
  git worktree add ../mnext-relver -b feat/T-V33-VIEW-RELVER-A main
  ```

---

## 会话内容(整段贴给 Codex)

你是本仓库的工程实现代理(Codex)。严格遵守 AGENTS.md 全部 AG-xxx 约束。

开工前依次只读:AGENTS.md、docs/tasks/T-V33-VIEW-RELVER-A-关系版本读侧投影.md、以及卡中点名的实现文件 packages/server/src/main/java/com/mnext/server/ViewQueryDtos.java 与 ReadModelRepository.java(尤其约 663 行 `new RelationView(...)` 及其上游的 `SELECT rm_relation` 查询)。不读无关文件。

在 worktree ../mnext-relver(分支 feat/T-V33-VIEW-RELVER-A)工作。只实现这一张卡,限定在卡的"涉及文件(封闭清单)"内最小改动。硬约束:

- **纯读侧、零写**:只把 `rm_relation.version` 读出并投到 `RelationView`,绝不 INSERT/UPDATE/DELETE 主数据(AG-110),不碰命令/投影写路径。
- **不得新增或修改任何 Flyway 迁移**;`rm_relation.version` 须已存在,开工先确认——**若该列不存在,立即停下回报**(需迁移=人发起,AG-501),不自行加列。
- 不改 contracts/**、AGENTS.md、ADR/**;`RelationView` 是 server 内部读侧 DTO,若发现它实际受契约约束则停下回报。
- 查询有界(AG-202/203),沿用既有关系读取过滤;测试禁 sleep(AG-504);不引入新依赖(AG-502);server jacoco 按既有阈值。
- 测试就近扩展(如 ReadModelQueryIntegrationTest):断言关系读侧返回的 `RelationView.version` 为预期且在关系版本变化后递增。
- 不动 TS 端 RelationSummary(前端由 Claude 接)。

完成判据:`corepack pnpm verify` 全绿(贴 jacoco 摘要)、`pnpm architecture:check` 与 `pnpm contracts:check` 通过;`git diff --stat main` 仅限封闭清单。每步一 commit;PR 含 `Spec-Ref: T-V33-VIEW-RELVER-A` 与 AG-405 写后自检输出。完成后停下等 Claude 审查,**不自行合并、不继续其它卡**。

---

## Codex 跑完后(Claude 收口)
Codex 提交分支 `feat/T-V33-VIEW-RELVER-A` 后,告诉 Claude;Claude 会:`git merge main` 拉平 → `corepack pnpm verify`(用 PATH 修复跑 mvnw)→ `node scripts/check-no-skipped.mjs` → 人核 `git diff --stat main` 封闭 → `--no-ff` 合入 main;随后前端补 `RelationSummary.version` 并启用连线删除/改型。
