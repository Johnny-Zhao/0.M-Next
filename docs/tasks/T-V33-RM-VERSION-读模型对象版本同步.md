# T-V33-RM-VERSION — 读模型对象版本同步(编辑闭环根因·后端)

**packages/server(读模型投影)域。涉及读路径投影逻辑,可能需 1 个新迁移?优先不动表结构。** 前置:main。
**严重 bug(编辑闭环根因)**:工作台改字段后,写库成功但**画布不刷新、且持续 409**。已定位为读模型投影缺陷。

## 根因(已读代码确认)
- 编辑字段 → 内核发 `FieldChanged`(改值,字段版本)+ `ObjectUpdated`(对象版本 +1,见 `UpdateFieldsHandler.incrementObjectVersion`)。
- `ReadModelProjection.project`(`packages/server/.../ReadModelProjection.java`):
  - `case "FieldChanged"` → `fieldChanged()` → `repository.updateField(..., event.version(), ...)`;
  - **`case "BatchCommitted","ObjectUpdated" -> { /* 空操作 */ }`(第 61-63 行)** —— 对象版本更新**根本没投影**。
- 后果:
  1. **rm_object 的对象版本不跟随写库对象版本**(写库 21,读库 15,差距随编辑越拉越大)→ 前端从视图读到的 `object.version` 永远落后 → `UpdateFields` 乐观锁 `expectedObjectVersion != object.version()` **必然 409**。
  2. `ReadModelRepository.updateField` 的 `WHERE ... AND (NOT jsonb_exists(fields, ?) OR version < ?)` 版本守卫,在版本语义错乱下可能**丢弃字段值更新** → 画布读到旧值。
- 现象自洽:写库 length=12 已写入(写没问题),但读库 version=15、值是旧的 → "弹回原值""面积不变""一直 409"。

## 目标
编辑字段后:**rm_object 的字段值更新**,且 **rm_object 的对象版本与写库对象版本一致**,使前端乐观锁匹配、画布即时反映改动。CQRS 仍异步,但读库要能**正确、单调地追平**写库版本,不再发散。

## 范围(后端)
- **A. 投影 ObjectUpdated**:`ReadModelProjection` 为 `ObjectUpdated` 增加处理——把 rm_object 的对象版本更新为该事件的对象版本(`event.version()`),`updated_at` 同步。新增 `ReadModelRepository.bumpObjectVersion(workspaceId, objectId, version, updatedAt)`(只 UPDATE 现有行,`version < ?` 单调守卫,幂等)。
- **B. 理清版本语义**:区分**对象版本**与**字段版本**。`fieldChanged` 的 `updateField` 守卫不应被对象版本污染而丢弃字段值更新——确保字段值始终按字段事件正确落库(必要时字段值更新与对象版本更新解耦:字段值用字段版本/时间序守卫,对象版本单独由 ObjectUpdated 维护)。**目标:编辑后读库既有新值、对象版本又对齐写库。**
- **C. 幂等与顺序**:沿用现有 `consumed(eventId)` 幂等;保证乱序到达时版本单调不回退。
- **D. 不改写入语义、不改命令、不改 rm_* 既有列**(若确需新增列须人工确认;优先用现有 `version` 列)。

## 封闭文件清单
**修改**:`packages/server/src/main/java/com/mnext/server/ReadModelProjection.java`、`ReadModelRepository.java`;新增/补充后端 E2E 测试。
**零碰**:前端、契约、Flyway 迁移(除非 B 必须;必须则停下回报)、命令/写入语义。

## 红线 / 门禁
- 只修读模型投影,使读库版本/值正确追平写库;**不改写入语义、不改命令、不改既有表结构**(需迁移则停下回报)。
- 新增 E2E:建对象→`UpdateFields` 改字段→**读视图:字段值已更新、对象版本==写库版本**;连续多次编辑版本单调对齐、无丢更新。
- `corepack pnpm verify` 全绿(含后端 E2E);只 add 本卡相关文件。
- 分支 `feat/T-V33-rm-version` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + 测试汇总。命中红线(尤其需迁移/动写入)停下回报,不夹带。

## 验收
1. dev 起后端,改"暗次卧"长/宽/窗面积→保存→**一次成功(不再 409)**;读视图与画布**即时反映新值**(面积/窗地比/规则灯联动),版本前后端一致。
2. 连续编辑同一对象多次,均成功、版本单调对齐、无 409 风暴、无丢更新。
3. verify 全绿(含新增 E2E);无写入/契约 diff。
