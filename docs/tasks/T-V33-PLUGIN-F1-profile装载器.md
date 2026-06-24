# T-V33-PLUGIN-F1 — ProfileLoader + 声明式 profile 清单 + 装卸(后端基建)

蓝本:`docs/设计稿-领域插件机制.md` §3 F1 + §5bis 装卸(决策 B)。**packages/server(+ 必要时 kernel 读侧)。扩展点 = 人发起的 core 改动(经确认)。** 前置:**main 含 `T-V33-PLUGIN-F0`(模板 withdrawn 状态 + withdraw/restore 受治理转换)** —— uninstall 直接调用 F0 的 `withdrawTemplateVersion`、重装调 `restoreTemplateVersion`,本卡不再自行处理撤下状态。

## 定位
让领域 profile 成为**声明式数据清单**,由 **ProfileLoader 在运行时经现有 tpl-api 命令路径装载**(不再写死在 E2E 测试里),并支持**装/卸(install/uninstall),幂等、可逆、非破坏**。这是"领域=可装卸插件"的后端底座。**不改命令/事件契约、不改求值逻辑、不加业务迁移**(装载只是按序发已有命令)。

## 现状(先验证)
- 定义命令分散在多处:`MetaCommandService`(createTemplate/createTemplateVersion/defineValueType/defineObjectType/defineFieldDef/defineRelationType/publishTemplateVersion/instantiateWorkspace/applyTemplateVersion);**`DefineDerivedField` 走 `/meta-commands`、`DefineRule`/`PublishRule` 走 `/rule-commands`**(见 `MetaCommandController`/`RuleCommandController`)。
- **`BatchCommandHandler` 只处理数据命令**(CreateObject/…),**不含 meta/rule 定义命令**——故 Loader 不能只靠它,要编排 MetaCommandService + 规则命令路径。
- **若某定义命令只在 controller 层、无可注入 service(Loader 取不到)→ 需薄封装内部分发;若这需要改契约才能装载 → 停下回报,不夹带。**

## 范围
- **A. 清单 schema** `ProfileManifest`(JSON,放领域包,见 D-INTERIOR;本卡只定义 schema + 解析 + 校验):
  ```jsonc
  {
    "id": "interior-design", "name": "室内设计", "version": "1.0.0",
    "templateCode": "interior_design",
    "valueTypes":   [{ "code","name","basePrimitive" }],
    "objectTypes":  [{ "code","name","parent?" }],
    "fields":       [{ "objectType","code","name","dataType?","valueType?","required" }],
    "relations":    [{ "code","name","source","target", ...defaults }],
    "derived":      [{ "objectType","code","name","resultType","derivation" }],
    "rules":        [{ "code","objectType","severity","when","message" }]
  }
  ```
  - 校验:引用完整性(field.objectType 存在等)、code 唯一、severity∈{BLOCK,WARN,INFO};**不臆造缺省**,缺字段按命令本身的必填规则报错。
- **B. `ProfileLoader.install(manifest, actor)`**:按序经现有命令服务发 createTemplate→createTemplateVersion→defineValueType*→defineObjectType*→defineFieldDef*→defineRelationType*→defineDerivedField*→defineRule*+publishRule*→publishTemplateVersion。
  - **幂等**:templateCode+version 已装载 → no-op(或基于 idempotencyKey 安全重放),**不重复建**。
  - **原子**:装到一半失败 → 回滚,不留半个模板(用事务或失败补偿)。
- **C. `ProfileLoader.uninstall(templateCode, actor)` = 撤下/停用**:把该模板版本标 `withdrawn`/停用,使其**不再出现在 `/views/templates`、不可再新实例化**。**非破坏、可逆**:不硬删模板/工作空间/用户数据;**已实例化工作空间照常工作**(类型/字段/规则实例化时已拷入,`template_version_id IS NULL`)。重装恢复可用。
  - withdraw 状态落在哪:优先复用 `scene_template_version.status`(若有可表达"撤下"的取值);**若需新增状态/列才能表达 withdraw → 这是迁移,停下回报,不夹带**。
- **D. 安装登记/查询**:能列出"已装插件"(由已装载且未撤下的模板派生即可,本批不单建表)。

## 封闭文件清单
**新增**:`packages/server/src/main/java/com/mnext/server/plugin/ProfileManifest.java`、`ProfileLoader.java`(+ 解析/校验)、`packages/server/src/test/java/com/mnext/server/ProfileLoaderIntegrationTest.java`、测试用最小清单 fixture。
**修改(若必需且不改契约)**:仅为 withdraw 复用现有状态而读/写 `scene_template_version`(只读优先)。
**零碰**:命令/事件契约本体、kernel 写命令、派生/规则求值逻辑、其它域;**不加业务迁移**(withdraw 用现有状态;否则停下回报)。

## 红线 / 门禁
- 装载只**按序发已有 tpl-api 命令**;**不改命令/事件契约、不改求值逻辑、不新增依赖**(AG-110/301/501)。
- 卸载**非破坏、可逆**:撤下/停用,**绝不硬删**模板/工作空间/用户数据(符合"不永久删除数据")。
- 幂等 + 原子(半装失败不留残);插件间隔离(装卸互不影响)。
- `corepack pnpm verify` / server 构建全绿;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped);与其它 e2e 错峰;jacoco 不降。
- AG-405 落盘自检;分支 `feat/T-V33-plugin-f1` 提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- **若 withdraw 需新迁移、或定义命令取不到 service、或装载需改契约 → 停下回报,不夹带。**

## 验收(集成测试,纯 API/service)
1. **装**:用最小测试清单(2 值类型 + 2 对象类型 + 字段 + 1 关系 + 1 派生 + 1 规则)`install` → 模板+版本已建并发布;`/views/templates`(卡③)能看到。
2. **实例化 + 跑**:从该模板 `instantiate` → 建对象 → 断言派生与规则灯。
3. **幂等**:重复 `install` 同清单 → 不重复建、结果一致。
4. **原子**:故意给坏清单(引用不存在的 objectType)→ install 失败且**不留半个模板**。
5. **卸**:`uninstall` → `/views/templates` 不再含该模板、不可再新实例化;**第2步建好的工作空间仍可读/可改/规则灯仍工作**(非破坏)。
6. **重装**:再 `install` → 恢复可实例化。
7. 回归:其它命令/视图不变;无业务迁移 diff。

## 跟进(本卡不做)
F4(前端维度注册表)、F5(面板/stencil 注册表)、F2(规则函数 SPI);把 energy/sysml/bus 的测试定义抽成清单(迁移为插件);插件描述符多版本/依赖管理。
