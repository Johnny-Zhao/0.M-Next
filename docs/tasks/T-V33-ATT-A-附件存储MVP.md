# T-V33-ATT-A — 附件存储 Phase 1(MVP)

蓝本:`docs/附件存储-设计稿.md`(§5 决策已定稿,契约 C1–C6 已批准发起)。前置在 main(v1.38)。**server 域 + 一条新迁移 V15 + 新契约文档/schema**。含 Docker 集成测试——**与其它 server e2e 错峰跑**。

> 体量偏大(SPI + 迁移 + 二进制端点 + 命令 + 投影 + 读视图 + 契约 + e2e)。**可拆两提交**在同一分支上推进:**1a** 存储 SPI + 迁移 + blob 上传/下载;**1b** AttachFile/DetachFile 命令 + 投影 + 读视图 + e2e。但**一张卡、一条分支 `feat/T-V33-att-a`**,verify 整体绿才回报。

## 目标
让任意对象旁挂附件(报价单/方案/资质):**两步**——先传 blob(内容寻址落盘),再下 `AttachFile` 命令记录元数据并关联对象;支持列表查询、流式下载、`DetachFile` 软删。平台只存取关联留痕,**不解析内容、不进元模型**。

## 范围

### A. 存储后端(SPI + 文件系统实现)
- 新接口 `StorageBackend`:`StoredBlob put(InputStream in, String contentType)`(返回 `{storageKey, sha256, sizeBytes}`,**服务端重算 sha256**,key=`sha256` 分桶如 `ab/cd/<sha256>`)、`InputStream get(String storageKey)`、`boolean exists(String storageKey)`、`Stat stat(String storageKey)`。
- 文件系统实现 `FilesystemStorageBackend`:根目录取配置 `mnext.storage.dir`(默认临时目录下 `mnext-attachments`);**幂等**:同 sha256 已存在则复用、不重写(天然去重,§5.5)。无新依赖(纯 JDK NIO + `MessageDigest`)。

### B. 迁移 `V15__attachment.sql`(server)
- `attachment`(主):`id uuid pk`、`workspace_id uuid not null`、`object_id uuid not null`(Phase 1 对象级,§5.3)、`scope_ref text null`(预留,Phase 1 不填)、`filename text not null`、`content_type text not null`、`size_bytes bigint not null`、`sha256 text not null`、`storage_key text not null`、`status text not null default 'ACTIVE'`、`created_by text not null`、`created_at timestamptz not null default now()`、唯一幂等键列(对齐现有 command_log/幂等做法)。
- `rm_attachment`(读模型):同字段子集,供 `/views` 只读查。
- 索引:`(workspace_id, object_id, status)`。

### C. blob 端点(二进制,不走命令日志)
- `POST /workspaces/{wid}/attachments/blob`(`application/octet-stream` 或 multipart;头带 `X-Filename`/`Content-Type`)→ 校验大小≤50MB、`content_type` 白名单(pdf / png·jpg·gif·svg·webp / docx·xlsx·pptx / csv·txt / zip)→ `StorageBackend.put` → 返回 `{storageKey, sha256, sizeBytes, contentType}`。**此步只落 blob,不写 attachment 行、不发命令。**超限/类型不符 → `ATT-413-TOO-LARGE` / `ATT-415-UNSUPPORTED-TYPE`。
- `GET /workspaces/{wid}/attachments/{id}/content` → 查 `rm_attachment` 校验 workspace 归属 + status=ACTIVE → `StorageBackend.get` 流式回传(`Content-Type`/`Content-Disposition`)。不存在/已删 → 404。

### D. 命令(JSON,经命令入口,AG-110)
域控制器 `AttachmentCommandController`(仿 `RuleCommandController`:`POST /workspaces/{wid}/attachment-commands`,`switch commandType`):
- `AttachFile`:`{objectId, filename, contentType, sizeBytes, sha256, storageKey}` → 校验 storageKey `exists` 且 `stat` 的 size/sha256 与载荷一致(防伪报/悬空)、object 存在、单对象 ACTIVE 数 < 50(`ATT-409-TOO-MANY`)→ 写 `attachment` 行 + `event_outbox` 事件 `FileAttached` → 返回 `CommandResult`(detail 含 `attachmentId=<uuid>`,与 meta-ids 风格一致)。
- `DetachFile`:`{attachmentId}` → 软删(status=DELETED)+ 事件 `FileDetached`;blob 不动(§5.5)。
- 幂等:`idempotencyKey` 走现有 command_log 机制。

### E. 投影 + 读视图
- 投影:**优先**新增 `AttachmentProjection` 订阅 outbox(若 `OutboxRelay` 支持多订阅者);**否则**在 `ReadModelProjection.project` 的 `switch` 里**追加** `case "FileAttached"/"FileDetached"`(纯追加,不改现有 case)。投影写/更新 `rm_attachment`。
- `AttachmentQueryController`:`GET /workspaces/{wid}/views/attachments?objectId=&status=ACTIVE`(只读、有界 ≤200)→ `AttachmentView[]{id, objectId, filename, contentType, sizeBytes, sha256, status, createdBy, createdAt}`(**不回 storageKey**,下载走 C 的端点)。

### F. 契约(**人发起,本卡内容即权威**——Codex 照抄,不自创字段)
- 新文档 `contracts/附件命令契约.md`:登记 `AttachFile`/`DetachFile` 命令信封 + payload + 事件 `FileAttached`/`FileDetached` + blob/下载/列表三端点 + 错误码 `ATT-4xx-` + 上限/白名单。
- 新 schema `contracts/schemas/attachment-commands.schema.json`:`AttachFile`/`DetachFile` 的 JSON Schema(对齐既有 `rule-commands.schema.json` 风格)。
- 夹具随契约(AG-406)。

## 封闭文件清单

**新增**
- `packages/server/src/main/java/com/mnext/server/storage/StorageBackend.java`
- `packages/server/src/main/java/com/mnext/server/storage/FilesystemStorageBackend.java`
- `packages/server/src/main/java/com/mnext/server/AttachmentBlobController.java`
- `packages/server/src/main/java/com/mnext/server/AttachmentCommandController.java`
- `packages/server/src/main/java/com/mnext/server/AttachmentCommandDtos.java`
- `packages/server/src/main/java/com/mnext/server/AttachmentRepository.java`
- `packages/server/src/main/java/com/mnext/server/AttachmentQueryController.java`
- `packages/server/src/main/java/com/mnext/server/AttachmentViewDtos.java`
- `packages/server/src/main/java/com/mnext/server/AttachmentProjection.java`（若走独立投影；否则不建此文件,改 E 的追加方案）
- `packages/server/src/main/resources/db/migration/V15__attachment.sql`
- `packages/server/src/test/java/com/mnext/server/AttachmentE2EIntegrationTest.java`
- `contracts/附件命令契约.md`
- `contracts/schemas/attachment-commands.schema.json`

**修改(仅在走"追加投影 case"方案时)**
- `packages/server/src/main/java/com/mnext/server/ReadModelProjection.java`（**纯追加** `FileAttached`/`FileDetached` 两 case,不动现有）
- `packages/server/src/main/resources/application.yml`（加 `mnext.storage.dir` + 上限配置,**仅追加键**）

**零碰**:kernel、engines、views/web、其它契约文档/schema、现有迁移、现有命令/读端点、其它投影 case。

## 红线 / 门禁
- 写经命令入口(AG-110);blob 二进制**不进命令日志**(两步,D);读视图只读零副本(AG-101/102);大小/数量/白名单有界(AG-202/203);错误码前缀 `ATT-4xx-`(AG-311)。
- **不引新依赖**(纯 JDK + 现有 Spring/Jackson;不引 commons-io、aws-sdk 等);S3 押 Phase 2。AG-502 依赖允许清单不动。
- 契约/schema 内容**以本卡 §F 为准**,Codex 不自创字段;契约即夹具(AG-406)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;集成测试 Docker 起、server 汇总 **`Skipped:0`**(+ `node scripts/check-no-skipped.mjs`)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**在分支 `feat/T-V33-att-a` 提交但不要合并**;基线落后只用 `git merge main` 拉平,别手动增删别的文件;完成发 `git diff --stat main` + server 测试汇总行。
- 若 `OutboxRelay` 不支持独立订阅者、或两步上传/幂等需改既有共享接线(非纯追加)、或需新依赖——**停下回报,不夹带**。

## 验收(集成测试,纯 API 无 JdbcTemplate 绕过)
1. 纯 API 建一个对象(meta + CreateObject);
2. `POST blob`(一个小 pdf 字节)→ 拿 `{storageKey, sha256, sizeBytes}`;**篡改 sha256 再 AttachFile → 被拒**(`ATT-409`/校验失败)。
3. 正常 `AttachFile` → `CommandResult` 含 `attachmentId`;await 投影后 `GET /views/attachments?objectId=` 查到该附件、字段一致、**不含 storageKey**。
4. `GET .../{id}/content` → 流回字节与上传一致(sha256 比对)。
5. **有界/校验**:>50MB → `ATT-413`;非白名单类型 → `ATT-415`;同对象传到第 51 个 → `ATT-409-TOO-MANY`;跨 workspace 取 → 404。
6. `DetachFile` → 列表查不到(ACTIVE 过滤)、下载 404;**blob 仍在**(`StorageBackend.exists` 仍真,验证软删不碰 blob)。
7. 幂等:同 `idempotencyKey` 重放 `AttachFile` 不产生重复行。

## 跟进(本卡不做)
- Phase 2:S3/MinIO 后端(挂同 SPI)、blob 引用计数 + GC、物理删。
- `scope_ref` 评分项级启用(随比选 UI)。
- 对象 provenance 抽屉"附件区" + 拖拽上传(UI 卡)。
