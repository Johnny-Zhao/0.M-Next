# T-V33-META-IDS — meta define 命令返回创建的 id(缺口修复)

来源:BID e2e 在"纯 API、禁 SQL"约束下暴露——meta define 命令不在结果里返回创建实体的 id,纯 API 客户端无法链式建模(建对象类型→拿不到 id→无法在其上 DefineFieldDef/DefineRelationType→无法 CreateRelation)。现状靠测试 SQL `SELECT id FROM object_type/relation_type WHERE code=?` 解析。根因统一(不止关系类型)。

口径:**kernel 域,一致性补齐**。`CreateTemplate` 已在结果明细返回 `templateId/templateVersionId`;本卡把同样约定补到其余 define 命令。**不改 payload/schema、不加命令、无迁移、无新错误码。** 契约见 `元模型命令契约.md` 的"命令返回创建 id addendum"(已在 main)。

## 范围

让以下 handler 在 `support.commit(...)` 的明细列表参数里返回创建实体的 id(沿用 `CreateTemplateHandler` 的 `key=value` 风格,如 `List.of("objectTypeId=" + id)`):

- `DefineObjectTypeHandler` → `objectTypeId=<uuid>`(当前 `List.of()`)
- `DefineRelationTypeHandler` → `relationTypeId=<uuid>`(当前 `List.of()`)
- `DefineFieldDefHandler` → `fieldDefId=<uuid>`
- `DefineValueTypeHandler` → `valueTypeId=<uuid>`

handler 内部本就生成/持有这些 id(insert 时用),只需放进 commit 明细。**幂等重放路径**也要带上(replay 返回的结果须含同一 id,与首次一致——若现有 replay 直接返回存档结果且其中已含 id 则天然满足;否则确保一致)。

## 封闭文件清单

**修改**
- `packages/kernel/src/main/java/com/mnext/kernel/internal/DefineObjectTypeHandler.java`
- `packages/kernel/src/main/java/com/mnext/kernel/internal/DefineRelationTypeHandler.java`
- `packages/kernel/src/main/java/com/mnext/kernel/internal/DefineFieldDefHandler.java`
- `packages/kernel/src/main/java/com/mnext/kernel/internal/DefineValueTypeHandler.java`
- 测试:`packages/kernel/src/test/java/com/mnext/kernel/internal/MetaModelIntegrationTest.java` 加断言(四个 define 命令的结果明细各含对应 id,且 id 与库中实际记录一致;重放返回同 id)。

**零碰**:server、engines、views、contracts(addendum 已在 main)、迁移、payload/schema、命令入口。

## 红线 / 门禁

- 仅填充既有 `CommandResult` 明细;不改命令 payload/schema/错误码/入口(AG-301 行为增量)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;kernel 集成测试 Docker 起、**Skipped:0**(+ `scripts/check-no-skipped.mjs`)。
- AG-405 落盘自检;完成发 `git diff --stat main`(应仅四 handler + 测试)+ kernel 测试汇总。

## 验收
- 四个 define 命令的 `CommandResult` 明细分别含 `objectTypeId/relationTypeId/fieldDefId/valueTypeId=<uuid>`,且 id 与库中记录一致;
- 重放(同幂等键同载荷)返回相同 id;
- 不破坏既有测试(它们仍可用,只是多了可读的 id)。

## 跟进
- BID-A 解封:据此纯 API 链式建模(每步从结果取 id),删掉对测试 SQL 的依赖;
- 既有 e2e(fed/bus/energy)后续可逐步删 `SELECT id` 测试 SQL 转纯结果取 id(可选,不强制)。
