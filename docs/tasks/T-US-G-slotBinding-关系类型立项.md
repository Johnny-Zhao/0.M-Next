# 立项 brief T-US-G-slotBinding — 槽位绑定关系化(G5)· 需设计拍板后方可实现

- 状态:**立项 / 待设计决策**(**非即刻可实现**——后端/契约/views/元模型全缺,且触及"槽位如何在内核建模")
- 性质:内核**新特性提案**,非小卡。本文件是范围与选项 brief,供拍板;拍板后再拆实现卡
- 参考:`docs/预研-E3-同源Mock到内核契约对接.md(§四 G5)`、`packages/web/src/unisource/model/view-layer.ts(SlotBinding)`、`packages/web/src/unisource/template/template-canvas.tsx(bindSlot 调用)`、`contracts/数据内核命令与事件契约.md(§3.4 CreateRelation / §3.5 UpdateRelation / §3.7 Unlink)`

## 问题(必读)

同源的「槽位实例化」现在是**前端投影**:`SlotBinding`(`Expression.space` 的槽位 ↔ 某 `object`),`bindSlot`/`unbindSlot` 只改前端状态(`template-canvas.tsx` 调 `workspaceStore.bindSlot`)。G5 要把它**关系化**为内核关系。

**核心障碍:内核关系是 `object ↔ object`,而"槽位"是视图/表达层概念(`Expression.space` 的一个位置),不是内核对象。** 全仓检索确认 `slot_binding` 在 **server、contracts、views、schema 全无**——比 ChangeState(后端有、仅 client 缺)彻底得多。所以关系化**前提**是先回答:**槽位怎么在内核建模?** 这是元模型层的产品/架构决策,不是补个 client 方法能了。

## 选项(需你拍板)

**A — 槽位成为内核对象 + slot_binding 关系类型(完整关系化)。**
新增 `ObjectType: template_slot`(槽位即一等对象)+ `RelationType: slot_binding`(`template_slot → bound_object`,基数 1:1、有向)。`bindSlot`=`CreateRelation(slot_binding)`,`unbind`=`Unlink`,`rebind`=`Unlink+CreateRelation`(或 `UpdateRelation` 换端点)。**复用现有命令**(CreateRelation/UpdateRelation/Unlink——后者的 client 方法见 T-US-G-updateRelation),无需新命令,但需:①元模型注册 template_slot + slot_binding(server+contract+schema);②模板实例化时先建 slot 对象;③unisource `bindSlot` 改走 `createRelation`。**改动大、跨后端+前端多卡**,但语义最正(槽位可查询/血缘/基数约束/多视图一致)。

**B — 绑定记在目标对象的字段(轻量,非关系)。**
在 bound_object 上加字段 `boundSlotRef`(记 exprId+slotId),不新增关系类型。`bindSlot`=`UpdateFields`。**改动小**(复用现有写路径),但**丢失关系语义**(不可做关系矩阵/血缘/基数校验),只是把前端投影挪成字段。

**C — 保持前端投影(现状,P4 已采)。**
关系化永不做,`SlotBinding` 维持前端。演示与当前产品足够。**零成本**。

## 推荐

除非产品明确需要"槽位实例作为一等关系可被查询 / 进血缘 / 受基数约束 / 多视图一致",否则 **C(现状)已够**(P4 正是此选)。若确需关系语义,选 **A**,并按阶段拆卡:

1. **后端+契约+schema:** 注册 `template_slot` ObjectType + `slot_binding` RelationType(端点类型/方向/基数 1:1/唯一约束);复用 CreateRelation/UpdateRelation/Unlink,无新命令。
2. **模板实例化:** 发布/实例化模板时为每个槽位建 `template_slot` 对象(或懒建)。
3. **views:** `relationTypes` 读已够;写复用 `createRelation`/`updateRelation`(依赖 T-US-G-updateRelation)/`unlink`——**无需新 client 方法**。
4. **unisource:** `bindSlot`/`unbindSlot` 改走 `gateway.createRelation`/`unlink`(slot_binding relationTypeId),经 016 写桥落内核;`SlotBinding` 前端投影降级为读模型派生。

## 结论

本卡**不含封闭文件清单/可执行改动**——它是立项 brief。**实现前需你就 A / B / C 拍板**;若选 A,它是一串跨 server+contract+views+unisource 的工程(约 4 张卡),不是小卡,建议 P4 之后单独排期。拍板后我按选定路径拆实现卡。
