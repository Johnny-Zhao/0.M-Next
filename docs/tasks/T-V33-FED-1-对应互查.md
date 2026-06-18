# T-V33-FED-1 — 跨 profile 对应与联邦互查

蓝本:`docs/20` §1.A。前置:fed-spec 在 main。**server 读侧**(对应关系用既有 DefineRelationType/CreateRelation,无需新命令/迁移)。

## 范围

- **对应关系无需新建机制**:跨 profile 的 correspondence(如 `realizes`:bus_link→sysml_block)用既有 `DefineRelationType`(端点跨 profile)+ `CreateRelation` 即可建,已投影进 rm_relation。
- **新增联邦互查端点**:给一个对象 + correspondence 关系类型,返回其对应对象(**双向**:该对象作 source 或 target),含目标 object_type_code + 关键字段。

## 封闭文件清单

- `packages/server/src/main/java/com/mnext/server/`:`ViewQueryController` 加 `GET /workspaces/{id}/views/correspondences?objectId=&relationType=&page=&size=`;`ReadModelRepository` 加查询(rm_relation 双向 join rm_object,按 relationType+objectId,分页有界);`ViewQueryDtos` 加返回类型。
- 测试:server 集成——定义两类型(如 sysml_block、bus_link)+ `realizes` 关系(bus_link→sysml_block)→ CreateObject 各一 + CreateRelation(link realizes block)→ 互查端点:查 link 的 realizes 对应 → 返回 block;查 block 的 realizes 对应(反向)→ 返回 link;关键字段正确;分页有界。

零碰:kernel、engines、views/web(前端联邦视图后置)、contracts(已固定)、迁移、命令侧。

## 红线 / 门禁

AG-101/102 只读零副本;AG-202/203 分页有界。`pnpm verify` 全绿 + jacoco ≥0.80;集成测试 Docker 起、Skipped:0。落盘防截断自检。完成停,发 `git diff --stat main` + verify server 测试汇总。

## 跟进
fed-2:M2M 转换执行(DefineTransformation/RunTransformation,生成目标模型 + 回填 correspondence)。fed-3:大 e2e 收官。
