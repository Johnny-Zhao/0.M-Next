# T-V33-MAPPING-COVERAGE — 映射覆盖只读端点(阶段二·2b 扩展,2c 前置)

> 缘起:2c(MAPPING-VIEW,纯前端)需要"实例覆盖 / 已过期下钻",但 2b 只暴露了 `/views/mapping-profiles`,缺覆盖端点。纯前端卡补后端越红线,故单独成卡。
> **packages/server 域,只读视图查询,零迁移、零写入语义变更。** 前置:main(含 2b MAPPING-PROFILE:映射 profile + 跨 profile correspondence relation_type)。

## 目标
为 2c 提供两个**只读**端点:类型层对应骨架 + 实例层覆盖(已映射/未映射/已过期)。读法对齐现有 `/views/matrix`、`/views/lineage` 的只读零拷贝风格。

## 现状(已核实)
- `ViewQueryController` 有 `/workspaces/{ws}/views/{object-types,objects,lineage,relations,tree,matrix,…}` 等只读端点;**无 `/views/mapping/correspondences`**。
- `ReadModelRepository.correspondences(workspaceId, objectId, relationType, page, size)` 已实现"按关系类型查某对象的对应"(读 rm_relation+rm_object,ACTIVE,双向);`CorrespondenceView` DTO 在 `ViewQueryDtos`。
- `rm_object.version BIGINT` 存在(过期判定依据);`rm_relation` 有 `version`。
- 2b 已落地映射 profile + 跨 profile correspondence relation_type + `workspace_profile`(已应用 profile)。

## 范围(只读,零迁移)
- **A. 端点①——类型骨架** `GET /workspaces/{ws}/views/mapping/correspondences`:列出该工作空间**已应用的映射 profile 内**的 correspondence relation_type(类型层),每条含:correspondenceId(relation_type id)、code、源 stereotype(code/name)、目标 stereotype(code/name)、direction、cardinality。小而稳、可分页。
- **B. 端点②——实例覆盖** `GET /workspaces/{ws}/views/mapping/correspondences/{correspondenceId}/coverage?page&size`:对该对应的**源类型实例**逐条返回:sourceObject(id/label/version)、targetObject(id/label,或 null=未映射)、status ∈ `mapped|unmapped|stale`。
  - **mapped/unmapped**:源实例经该 correspondence relation 是否连到目标实例(读 rm_relation,复用 `correspondences` 逻辑)。**必做。**
  - **stale(过期)**:源对象当前 `version` > 该映射锚定的源版本即过期。**若现有 schema 能取到锚定版本**(如 rm_relation 记录的创建期源版本 / m2m_transformation 的锚定)则实现;**取不到则本卡过期降级为"未知"并在跟进里标注**——本卡**不为过期加列、不做迁移**。
  - 分页、限定 page size(沿用 matrix/lineage 上限)。
- **C. 不改**:既有端点/契约/读模型投影/写入路径;只新增这两个只读端点 + 对应 DTO + view-client 类型(若本卡含前端 client 声明;否则留给 2c)。

## 封闭文件清单
**修改/新增**:`ViewQueryController.java`(加两端点)、`ReadModelRepository.java`(加覆盖查询,复用/扩 correspondences)、`ViewQueryDtos.java`(覆盖 DTO)、必要时 `packages/views/src/api/view-client.ts` 加只读方法、相关只读 E2E(`MappingCoverageQueryIntegrationTest`)。
**零碰**:写入命令、迁移、读模型投影语义、2b 既有端点、前端视图组件(那是 2c)。

## 红线 / 门禁
- **只读视图查询,零迁移、零写入语义变更**;读 rm_*(零拷贝),不碰写路径、不触发转换。
- 过期判定**不得为此加列/加迁移**;取不到锚定版本就降级为"未知"+ 跟进。
- 分页、page size 上限;大覆盖性能稳。
- 现有功能零回归;`corepack pnpm verify` 全绿(含只读 E2E)。
- 分支 `feat/T-V33-mapping-coverage` 从 main 起、提交不合并;先 `git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡相关文件;完成发 `git diff --stat main` + 测试汇总。命中红线(需迁移/动写入语义)停下回报,不夹带。

## 验收
1. `GET /views/mapping/correspondences` 返回工作空间内映射 profile 的 correspondence 类型骨架(源/目标 stereotype、方向、基数)。
2. `GET /views/mapping/correspondences/{id}/coverage` 分页返回源实例的 mapped/unmapped;若锚定版本可得则正确标 stale。
3. 只读、无写入/迁移 diff;单 profile / 既有视图零回归;verify 全绿。

## 跟进(本卡不做)
过期判定若需锚定列 → 单独迁移卡;覆盖率统计汇总;`rm_correspondence` 预投影(性能护栏)。
