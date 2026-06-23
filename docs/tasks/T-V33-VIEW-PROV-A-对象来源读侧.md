# T-V33-VIEW-PROV-A — 视图扩展:对象来源(provenance ②a,读模型加列 + 投影)

蓝本:`docs/设计稿-视图API扩展…` ②a(已确认)。**server 域**,含**小迁移 + 投影**。**人发起的契约/迁移变更(经确认)**。前置:main(含 RULE-A)。

定位:把对象**来源的归一化类别(kind)**经只读视图暴露,让属性面板"护照"显示 **来源(粗粒度:人工 / 导入类 / 规则 / AI / 制品)+ 新鲜度**(新鲜度已有 `updatedAt`)。**事件当前只带归一化 kind、不带具体系统 ref**,故本卡只做 kind(已定选项 B);"具体哪个工具(excel/sysml)"等事件契约卡 **EVT-SOURCE**。**写不经此;只补读模型投影 + 视图字段。**

## 现状
- 对象创建/改 命令带 `SourceInfo`(kind + system,如 artifact_sync/excel-import/人工/规则/AI);事件里有。
- **读模型 `rm_object` 不带来源列**;`ViewObject` DTO 无 `source`。

## 范围(B:仅 source_kind)
- **A. 迁移 `V20__rm_object_source.sql`**:给 `rm_object` **只加一列** `source_kind VARCHAR`(可空,历史行留空)。**不加 system 列**;仅 readmodel 表,不动主数据/命令/事件表。
- **B. 投影**:`ReadModelProjection` 投影对象事件时,把事件 envelope **已带的归一化 source(kind)**写入 `source_kind`(无则留空)。**只读模型侧,不改命令/事件契约。**
- **C. DTO + 控制器**:`ViewObject` 增只读 `source`(字符串 = kind,如 `artifact_sync`/`manual`;无 → `null`/`"unknown"`);`…/views/objects`、`…/objects/{id}` 从 `rm_object` 填充。
- **D. TS 客户端**:`view-client.ts` 的 `ViewObject` 加 `readonly source: string | null`(镜像)。
- 新鲜度不另做(`updatedAt` 已在);**具体系统/工具(ref)、下游依赖**留后续(见跟进)。

## 封闭文件清单
**修改**:`ReadModelProjection.java`、`ReadModelRepository.java`(读 source)、`ViewQueryController.java`、`ViewQueryDtos.java`、`packages/views/src/api/view-client.ts`、(若有)OpenAPI 契约
**新增**:`packages/server/src/main/resources/db/migration/V20__rm_object_source.sql`、`packages/server/src/test/java/com/mnext/server/ObjectSourceQueryIntegrationTest.java`、view-client 测试用例
**零碰**:命令/事件本体、kernel/engines、`check_result`/recommendation/ai/import 逻辑、其它迁移。

## 红线 / 门禁
- **只读模型**:迁移仅加 `rm_object` 列;投影只补读模型;**不改主数据表、命令、事件契约**(AG-110/301/501,经确认)。
- 历史行 source 可空 → 视图返回时空值给 `null`/`"unknown"`,**不编造**。
- 迁移版本 `V20`(当前最高 V19);若与他人撞号 → 改下一个可用号,先查。
- `corepack pnpm verify` 全绿;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped);与其它 server e2e 错峰;jacoco 不降。
- AG-405 落盘自检;分支 `feat/T-V33-view-prov-a` 提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若 `SourceInfo` 未随对象事件传到投影、或需改事件契约才能拿到 source → **停下回报,不夹带**。

## 验收(集成测试,纯 API)
1. 经命令建对象(走不同来源路径:导入 vs 人工)+ 投影追平。
2. `GET …/views/objects/{id}` 与列表:`source` 反映事件携带的**归一化 kind**(如 `artifact_sync` / `manual`);**不要求区分具体工具**(excel vs sysml 同属一个 kind,属预期);历史/无来源 → `null`/`unknown`,不编造。
3. `updatedAt`(新鲜度)仍正常返回。
4. 回归:RULE-A 的 `ruleStatus`、objects/relations/recommendation 其它字段与行为不变;views 仍只读。
5. view-client:测试断言 `source`(`string | null`)解析。

## 跟进(本卡不做)
- **EVT-SOURCE(事件契约卡,人发起)**:让 `ObjectCreated`/相关事件携带**完整 `SourceInfo`(kind + ref/system)**——改 `EventFactory` + 事件 schema + 重放兼容;落地后护照才能显示"具体哪个工具(excel/sysml)",本卡 `source` 升级为 `{kind, system}`。
- ②b 血缘端点(上游/算法/下游)、③ 维度集、④ 一致性比对。
