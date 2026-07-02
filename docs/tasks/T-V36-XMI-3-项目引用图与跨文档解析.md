# T-V36-XMI-3 — 项目引用图 + 跨文档解析 + 自定义 profile 透传(完整双向·第三步)

> **packages/engines + packages/server 域;零迁移(吃 V30 身份/基线表)。** 前置:main(XMI-2 已合,`(project, xmi:id)` 身份 + 基线文档集在);设计稿《设计-完整双向XMI交换》§4.3/§4.5。
> 把"单项目导入"扩成"项目集导入":集合内跨文档引用绑成平台关系/correspondence,集合外引用与自定义 profile **整体透传不丢**。

## 目标
支持**一次导入一个项目集**(主项目 + 依赖的库/profile 项目),并:
1. **集合内** href(被引项目也在集合里)→ 解析为平台对象,升级为**平台关系 / correspondence**(走阶段二跨 profile 对应机制)。
2. **集合外** href(被引项目未导入)→ 存为**未解析外部引用,reference 级 passthrough**,原样保留待 XMI-4 出向回吐。
3. **自定义 profile**(manifest 未声明的 stereotype 来源)→ **v1 保留即透传**:profile 文档 + stereotype 应用整体兜住,M-Next 当通用对象(uml_class + 保留 stereotype 名),能往返不深读。
**v2 元模型摄入(自定义 profile→template_version)不在本卡,押后单列。**

## 现状(已核实)
- XMI-2:`(project_ref, xmi_id)→platform_id` 身份表 + 基线文档表;sysml-xmi apply 落身份/基线(单 project_ref=default)。
- XMI-1:引擎可映射 §3 子集,manifest 未声明 stereotype 归通用、保留名(已留透传口)。
- 阶段二:跨 profile correspondence relation_type(V25)、`/views/mapping/*` 机制在。

## 范围(引擎+server,零迁移)
- **A. 项目集导入**:导入入口接受**多文档项目集**(主 + 库/profile),每文档分配/识别 `project_ref`(替代 XMI-2 的单一 default);身份/基线**按 project_ref 分别落**(吃 V30 表,不改表结构)。
- **B. 跨文档引用解析**(引擎 codec + server):
  - 解析元素间 `href`/proxy 引用,判定**集合内/外**。
  - 集合内 → 经身份表绑定到对方 platform_id,**生成平台关系或跨 profile correspondence**(复用阶段二机制,不新造)。
  - 集合外 → 记为**未解析外部引用**,在基线/passthrough 槽原样保留(reference 级,不丢、不臆造)。
- **C. 自定义 profile 透传**(引擎):未知 profile 的文档 + stereotype 应用整体保留;元素落为通用对象 + 保留 stereotype 名;**不报错、不丢**。
- **D. 不改**:V30 表结构、读模型投影、阶段二 correspondence 语义(只复用)、其它领域、其它适配器、迁移、前端、delta 出向(留 XMI-4)。

## 封闭文件清单
**修改/新增**:`packages/engines/.../exchange/sysml/`(codec 跨文档 href 解析 + passthrough 寄存结构、模型扩引用)、`packages/server/.../ExchangeController` 或导入装配处(项目集 + project_ref 解析 + 集合内引用经身份升级为关系/correspondence + 集合外保留)、相关 E2E(多项目集:集合内引用解析、集合外保留、自定义 profile 透传)。
**零碰**:V30 表结构与迁移、读模型投影、阶段二 correspondence 写入语义、其它适配器/领域、前端、delta 出向。

## 红线 / 门禁
- **零迁移**(吃 V30);零碰读模型/阶段二语义/其它领域/其它适配器。
- 跨文档引用:集合内解析、集合外**原样保留不丢**;自定义 profile **整体透传不丢不报错**。
- 集合内引用升级为关系/correspondence **复用阶段二机制**,不新造、不改其语义。
- Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`,含多项目集 E2E)。
- 分支 `feat/T-V36-xmi3-project-refs` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main` + 测试汇总。命中红线(动 V30 表/阶段二语义/读模型/其它领域)停下回报,不夹带。

## 验收
1. 导入"主项目 + 库/profile 项目"集合:集合内跨文档需求/部件引用解析为平台关系/correspondence,`/views/mapping/*` 可见。
2. 引用了未导入项目的 href:原样保留为未解析外部引用,不丢、不报错。
3. 含自定义 stereotype 的 profile:整体透传保留,元素落通用对象 + 保留 stereotype 名;往返不丢。
4. 阶段二/其它领域/其它适配器零回归;verify 全绿 Skipped:0;无迁移 diff。

## 跟进(本卡不做)
XMI-4 Delta 合并出向(读身份/基线 + passthrough 打回基线文档集);XMI-5 多项目无损往返 E2E;XMI-6 重导入/基线刷新(项目集级、串行归属);元模型摄入 v2;B2 并发冲突。
