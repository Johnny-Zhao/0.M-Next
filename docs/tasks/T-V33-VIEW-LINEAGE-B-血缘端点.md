# T-V33-VIEW-LINEAGE-B — 视图扩展:派生值血缘端点(②b,只读,按需introspect)

蓝本:`设计稿-视图API扩展…` ②b(已确认)。**server 视图读侧**。**人发起的契约变更(经确认)**。前置:main(含 RULE-A + PROV-A)。

定位:给某个派生值/字段返回**上游(输入)→ 算法(派生/规则)→ 下游(依赖者)**的血缘,让属性面板"血缘抽屉"展示。**纯读、有界、按需从元模型/规则定义 introspect,不新增存储/迁移。**

## 现状(据 PROV-A 之鉴,先验证再写)
- 派生字段的输入在**派生表达式定义**里(元模型 derived field);规则引用字段在**规则 DSL 定义**里。
- 这些"依赖"目前在引擎内,**未必有现成的"取依赖"读接口**。**本卡第一步:确认 DerivedEvaluator/表达式引擎 + 规则定义能否只读取出"引用了哪些字段/对象"**;
  - 能 → 按下方实现;
  - **不能(需改引擎/表达式 API 才能取依赖)→ 停下回报,不夹带**(同 PROV-A 的处理)。

## 范围(确认可 introspect 后)
- **端点**:`GET /workspaces/{wid}/views/lineage?objectId=&fieldCode=` 返回:
  - `upstream`: 该派生字段的输入(对象/字段 + 各自 `source`(来自 PROV-A 的 kind)/`updatedAt`),**深度 ≤2**;
  - `algorithm`: `{ kind: "derived"|"rule", ref: 表达式 id / 规则 code }`;
  - `downstream`: 依赖该字段的(派生字段 / 规则 / 推荐项),**节点 ≤200**;
  - 非派生字段 → upstream 空、algorithm `kind:"stored"`。
- **取数**:只读元模型(派生表达式定义)+ 规则定义 + 关系(`rm_relation`)+ PROV-A 的 source;**不持久化血缘、不加迁移**。
- **DTO + TS 客户端**:`LineageView` DTO;`view-client.ts` 加 `lineage(workspaceId, objectId, fieldCode)`。

## 封闭文件清单
**修改**:`ViewQueryController.java`、`ViewQueryDtos.java`、(读依赖)相关 repository/对 DerivedEvaluator 的只读访问、`packages/views/src/api/view-client.ts`、(若有)OpenAPI 契约
**新增**:`packages/server/src/test/java/com/mnext/server/LineageQueryIntegrationTest.java`、view-client 用例
**零碰**:写命令路径、派生/规则**求值逻辑本体**(只读其定义/依赖,不改算法)、迁移、其它域。

## 红线 / 门禁
- **只读**:读元模型/规则定义/关系/source 拼装血缘;**不写、不改求值逻辑、不加迁移**(AG-101/102)。
- **有界**:深度 ≤2、节点 ≤200;超界截断并标记(不无限展开)。
- **不编造**:取不到的依赖(如表达式无法解析输入)→ 该段标 `partial`/留空,**不臆造**上下游。
- 契约面变更经本稿确认;OpenAPI 契约测试同步;不引新依赖。
- `corepack pnpm verify` 全绿;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped);与其它 server e2e 错峰;jacoco 不降。
- AG-405 落盘自检;分支 `feat/T-V33-view-lineage-b` 提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + 测试汇总行。
- **若取依赖需改引擎/表达式 API 或改求值逻辑 → 停下回报,不夹带。**

## 验收(集成测试,纯 API)
1. 建对象 + 一个派生字段(输入为另外 1–2 个字段/对象)+ 一条引用它的规则。
2. `GET …/views/lineage?objectId=&fieldCode=派生字段`:
   - `upstream` 列出输入字段/对象(带 source/updatedAt);`algorithm.kind=derived` + ref 正确;`downstream` 含那条规则。
   - 非派生字段 → upstream 空、`algorithm.kind=stored`。
3. **有界**:构造深链 → 深度 >2 截断、节点 >200 截断并标记。
4. **不编造**:无法解析的依赖 → `partial`,不臆造。
5. 回归:RULE-A/PROV-A、objects/relations/recommendation 不变;views 仍只读。
6. view-client:`lineage()` URL/解析用例。

## 跟进(本卡不做)
③ 维度集元模型标签、④ 一致性比对、EVT-SOURCE(事件带全 SourceInfo)。
