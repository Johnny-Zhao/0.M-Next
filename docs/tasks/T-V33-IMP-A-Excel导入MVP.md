# T-V33-IMP-A — Excel 导入 MVP(Office 抽取 Phase 1)

蓝本:`docs/Office抽取-设计稿.md`(决策已定:Excel 先行、声明式映射、三级解析、import_task 持久化、入库经命令、不依赖 RBAC 但 RBAC 已在 main 故顺带受约束)。前置在 main(v1.44,含 `ExchangeAdapter` SPI/`AdapterRegistry`、`ExchangeController` 的 DataSet→命令入库范式、`StorageBackend`(ATT-A)、`WorkspaceAuthorizer`(RBAC))。**engines 适配器 + server 编排 + V18 迁移 + 新契约**。含 Docker e2e——**与其它 server e2e 错峰**。

定位:把 Excel 行→对象、列→字段,按**用户提供的映射描述**解析为统一数据,经命令入库(AUTHOR)。复用 POI(已在依赖)、`StorageBackend`(存原文件 blob)、`KernelCommandService`(入库,与 `ExchangeController` 同范式)。

## 范围

### A. 映射描述 + Excel 适配器(engines)
- `ImportMapping`(record):`sheet`(名或 index)、`headerRow`(默认 0)、`objectTypeCode`、`columns:[{header|colIndex → fieldDefCode}]`、`keyColumn`(可选,作对象名)。
- `ExcelImportAdapter`(POI XSSF,**纯函数、只读字节**):
  - `ExcelMetadata metadata(InputStream)` → `{sheets:[{name, headers:[...], rowCount}]}`(浅解析,供用户配映射)。
  - `DataSet parse(InputStream, ImportMapping)` → 按映射:每数据行(headerRow 之后)→ 一个 `DataObject`(objectTypeCode + 字段 = 映射列值;对象名 = keyColumn 值或行号);**只产对象 + 字段,不产关系**(关系押 Phase 2/Visio)。空行跳过;缺映射列→该字段空;类型转换失败→`IMPORT-422-` 抛错(带 行/列)。
  - **它是 Excel 专用、带映射的适配器**——若能干净实现 `ExchangeAdapter` 接口就实现并登记 services;若映射参数无法套进 SPI 签名,则做**独立类**(不登记 SPI),由 server 直接调。**二选一,哪个不破坏现有 SPI 选哪个;拿不准就停下回报。**
- 有界(AG-202/203):行数 ≤ `MAX_IMPORT_ROWS=5000`、列数 ≤ `MAX_IMPORT_COLS=200`,超限 `IMPORT-422-`。

### B. 数据模型(`V18__import_task.sql`)
- `import_task`:`id uuid pk`、`workspace_id`、`storage_key text`(原文件 blob,复用 `StorageBackend`)、`filename`、`sha256`、`status text not null`(REGISTERED/PARSED/IMPORTED/FAILED)、`mapping jsonb`(深解析时写)、`result jsonb`(入库统计:创建数/跳过/错误)、`created_by`、`created_at`。
- 读模型可省(量小,直接查主表)。

### C. 三级解析编排(server,新 `ImportController` + `ImportService`)
- **① 登记** `POST /workspaces/{wid}/imports`(multipart/octet-stream xlsx)→ `WorkspaceAuthorizer.require(actor, wid, WRITE_DATA)` → 校验大小≤50MB、类型=xlsx → `StorageBackend.put` 存 blob → 建 `import_task`(REGISTERED)→ 返回 `{importId, storageKey, sha256}`。
- **② 元数据** `GET /workspaces/{wid}/imports/{id}/metadata` → `StorageBackend.get` → `ExcelImportAdapter.metadata` → 返回 sheets/headers/rowCount(供配映射;不入库)。
- **③ 深解析入库** `POST /workspaces/{wid}/imports/{id}/parse`(body=`ImportMapping`)→ require WRITE_DATA → get blob → `adapter.parse(blob, mapping)` → 对每个 DataObject **经 `KernelCommandService.createObject`**(与 `ExchangeController` 同路径,落审计/版本/规则热路径)→ 写 result 统计 + status=IMPORTED;失败 status=FAILED + 错误详情。
- **入库一律经命令入口**(AG-110),不直接写 data_object;受规则热路径(BLOCK 会拦)与 RBAC(AUTHOR)约束。
- **幂等**:同 importId 重复 parse → 若已 IMPORTED 则拒绝/返回原结果(不重复建);命令侧 idempotencyKey 用 `importId+rowIndex` 派生。
- **MVP 只做"新增对象"**:keyColumn 作对象名;**跨文件 upsert/更新已存在对象押 Phase 1b**(避免 keyColumn→现有对象查找的额外缝)。

### D. 契约(**人发起,本卡 § 为准**)
- 新 `contracts/导入命令契约.md`(三端点 + ImportMapping schema + import_task 状态机 + IMPORT 错误码)。
- 新 `contracts/schemas/import-mapping.schema.json`(ImportMapping)。
- `error-codes.yaml` 追加 `IMPORT-400-SCHEMA-INVALID`、`IMPORT-404-TASK-NOT-FOUND`、`IMPORT-409-INVALID-STATE`、`IMPORT-413-TOO-LARGE`、`IMPORT-415-UNSUPPORTED-TYPE`、`IMPORT-422-PARSE-FAILED`。
- `scripts/check-contracts.mjs` 注册 `import-mapping`;夹具 `tests/contracts/fixtures/import-mapping/{valid,invalid}/*.json`(AG-406)。

## 封闭文件清单

**新增**
- `packages/engines/src/main/java/com/mnext/engines/exchange/office/ExcelImportAdapter.java`
- `packages/engines/src/main/java/com/mnext/engines/exchange/office/ImportMapping.java`(+ `ExcelMetadata` 可同文件)
- `packages/engines/src/test/java/com/mnext/engines/exchange/office/ExcelImportAdapterTest.java`(纯单测:测试内用 POI 造 xlsx 字节 → parse → 断言 DataSet)
- `packages/server/src/main/resources/db/migration/V18__import_task.sql`
- `packages/server/src/main/java/com/mnext/server/ImportController.java` + `ImportDtos.java`
- `packages/server/src/main/java/com/mnext/server/ImportService.java`
- `packages/server/src/main/java/com/mnext/server/ImportRepository.java`
- `packages/server/src/test/java/com/mnext/server/ExcelImportE2EIntegrationTest.java`
- `contracts/导入命令契约.md`、`contracts/schemas/import-mapping.schema.json`
- `tests/contracts/fixtures/import-mapping/{valid,invalid}/*.json`

**修改**
- `packages/shared/contracts/error-codes.yaml`、`scripts/check-contracts.mjs`
- (仅当 ExcelImportAdapter 干净实现 ExchangeAdapter 时)`META-INF/services/com.mnext.engines.exchange.ExchangeAdapter` 追加一行

**零碰**:kernel、views/web、其它迁移/契约、`ExchangeController` 本体(新建 ImportController,不改它)、领域命令本体。

## 红线 / 门禁
- 入库经命令入口(AG-110)、受 RBAC(WRITE_DATA)与规则热路径约束;原文件走 `StorageBackend`(复用,不新建存储)。
- 适配器纯函数、只读字节、不读库;有界(行/列/文件大小)。**不引新依赖**(POI 已在)。
- 不改现有 `ExchangeAdapter` 签名 / `ExchangeController` 本体;若 Excel 映射无法套进 SPI → 独立类,**别改 SPI**。
- 契约/错误码/夹具随卡(AG-406);前缀 `IMPORT-`(AG-311)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**分支 `feat/T-V33-imp-a` 提交不合并**;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若需改 ExchangeAdapter SPI、或入库需绕命令、或 keyColumn 更新已存在对象(那是 1b)——**停下回报,不夹带**。

## 验收(集成测试,纯 API)
1. **engines 单测**:测试内用 POI 造一个 2 sheet 的 xlsx(含表头 + 数据行 + 空行);给映射 → `parse` → 断言 DataObject 数、objectTypeCode、字段值、空行跳过;缺字段/类型错→`IMPORT-422`;超行/列限→抛错;`metadata` 返回正确 sheets/headers/rowCount。
2. **server e2e(纯 API)**:先 meta+命令建好目标对象类型(含若干字段)→ ① `POST imports`(传 xlsx 字节)→ importId;② `GET metadata` → 看到 sheets/headers;③ `POST parse`(映射)→ await 投影后用 `/views` 查到**按行建出的对象 + 字段值正确**;result 统计创建数对。
3. **有界/校验**:>50MB→`IMPORT-413`;非 xlsx→`IMPORT-415`;映射引用不存在的 fieldDefCode/objectTypeCode → 入库时命令报错并计入 result.errors;非法映射 schema→`IMPORT-400`;不存在 importId→`IMPORT-404`。
4. **幂等**:对已 IMPORTED 的 task 再 `parse` → 拒绝/返回原结果,不重复建对象。
5. **RBAC**(顺带):在已治理工作空间用 VIEWER 调 import → 403;AUTHOR → 200。
6. **热路径**:若某行触发 BLOCK 规则 → 该对象建失败、计入 result.errors,**其余行不受影响**(或整批策略,实现选一并在契约写明)。

## 跟进(本卡不做)
- Phase 1b:keyColumn → 更新已存在对象(upsert);跨表列→关系。
- Word(.docx 结构化块)、Visio(.vsdx 节点+连线→对象+关系)各自独立卡。
- 导入模板(映射存 tpl-api 复用);AI 辅助映射建议(归 AI 执行层)。
