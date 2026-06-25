# T-V33-VIEW-RELVER-A — 关系版本读侧投影

## 目标(一句话)
把读模型里已存在的 `rm_relation.version` 投影到读侧 DTO `RelationView`,让前端能拿到关系版本,从而解锁连线的删除/改型(`Unlink`/关系更新命令需要 `expectedVersion`)。

## 背景
- 现状:`RelationView`(`packages/server/src/main/java/com/mnext/server/ViewQueryDtos.java`)只含 `relationId / relationType / sourceId / targetId / fields / hierarchical`,**不含 version**;前端 `RelationSummary` 因此拿不到版本,连线删除/改型无法发命令(diagram-panel 里有老 TODO「删除关系需要关系版本投影」)。
- `rm_relation` 表**已有 `version` 列**(见 `ReadModelRepository` 中 `UPDATE rm_relation SET ... version = ? ... WHERE ... version < ?` 的 upsert 逻辑)。本卡只把它读出来投出去,**不新增迁移**。

## 范围
**只做读侧投影。** 给 `RelationView` 加 `long version`,在构造点(`ReadModelRepository.java` 约 663 行 `new RelationView(...)`)填入,并在喂给它的 `SELECT rm_relation` 查询里把 `version` 列读进来。

## 涉及文件(封闭清单,只许动这些)
- `packages/server/src/main/java/com/mnext/server/ViewQueryDtos.java` — `RelationView` record 增 `long version` 字段(放在 `hierarchical` 之后或合适位置)。
- `packages/server/src/main/java/com/mnext/server/ReadModelRepository.java` — 构造 `RelationView` 的方法:① 在读 `rm_relation` 的 `SELECT` 列表补 `version`;② RowMapper/构造调用补 `rs.getLong("version")`。**只动关系读取路径,不碰任何写/投影逻辑。**
- 测试(就近扩展,勿新建大文件):在已有的读模型查询集成测试(如 `packages/server/src/test/java/com/mnext/server/ReadModelQueryIntegrationTest.java`)里加断言:创建对象+关系后,读 `ObjectDetail.relations`(或关系查询端点)返回的 `RelationView.version` 为预期值;若对该关系执行一次会改版本的命令,再读到的 version 递增。

## 硬约束(AGENTS.md)
- **只读,零写**:本卡不得 INSERT/UPDATE/DELETE 主数据(AG-110);命令事务无关(纯查询路径)。
- **纯加性**:**不得新增/修改任何 Flyway 迁移**。`rm_relation.version` 必须已存在——开工先确认;**若发现该列不存在**,说明需要迁移 → **立即停下回报,不擅自加迁移**(AG-501,迁移由人发起)。
- **契约**:`RelationView` 是 server 内部读侧视图 DTO,不在 `contracts/schemas/**`。若你发现它实际受契约约束 → **停下回报**,不改 `contracts/**`、`AGENTS.md`、`ADR/**`。
- 查询有界(AG-202/203):沿用现有关系读取的过滤与分页,不放大扫描范围。
- 测试禁 `Thread.sleep`(AG-504);命名 `version`(snake/camel 各随所在层既有风格);审计/日志规范沿用既有。
- jacoco ≥ 0.80(server 模块按既有阈值);不得引入新依赖(AG-502)。

## 不做
- 不动 TS 端 `RelationSummary`(前端由 Claude 接;本卡纯后端)。
- 不实现 Unlink/关系改型/反转的命令侧或前端——本卡只把 version 投出来。
- 不碰其它读侧 DTO、不重排 `RelationView` 既有字段顺序之外的任何东西。

## 完成判据
- `corepack pnpm verify` 全绿(贴 jacoco 摘要);`pnpm architecture:check`、`pnpm contracts:check` 通过。
- `git diff --stat main` 仅限上面封闭清单。
- 每步一 commit;PR 含 `Spec-Ref: T-V33-VIEW-RELVER-A` 与 AG-405 写后自检输出(`wc -l` + `tail -3`)。
- 完成后**停下等 Claude 审查**,不自行合并、不继续其它卡。
