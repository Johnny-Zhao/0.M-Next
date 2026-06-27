# T-V33-EDIT-409 — 字段保存 409 版本冲突(编辑闭环最后一道)

**packages/web + packages/views 前端域,纯前端,零后端/契约。** 前置:main(已含 CMD-ACTOR)。
**Bug**:属性面板改字段→保存,后端返回 **409 Conflict**(乐观锁版本冲突),数据存不进。鉴权(X-Actor-Id)已通,卡在版本。

## 根因(已对内核代码核实)
内核 `UpdateFieldsHandler.conflicts(...)`:
```
expected = field.expectedFieldVersion
currentVersion = field.current==null ? 0 : field.current.version
objectConflict = (expected==null) && (expectedObjectVersion != object.version)
冲突 = objectConflict || (expected!=null && expected!=currentVersion)
```
即:`expectedFieldVersion==null` → 只校**对象版本**;非 null → 校**字段自身版本**。
前端 `inspector-panel.tsx` 的 `saveDrivingField` 传的是 **`expectedFieldVersion: object.version`(对象版本=1)**,但**字段版本≠对象版本**(种子字段版本为 0),`1 != 0` → 每次保存必 409。视图也未暴露字段版本,前端无从填对。

## 范围(最小改动)
- **A.** `packages/web/src/workbench/inspector-panel.tsx` `saveDrivingField`:**不再传 `expectedFieldVersion`**(置 `null`/省略),只依赖对象版本(`expectedObjectVersion`)做乐观锁——与 AI 确认路径(`AiChangeRepository` 传 `null`)一致。
- **B.** `packages/views/src/api/command-client.ts`:`FieldUpdate.expectedFieldVersion` 类型改为**可选/可空**(`expectedFieldVersion?: number | null`);`updateFields` 序列化时**省略该键或传 null**(注意:`post` 的 JSON.stringify 会自动丢弃 `undefined` 键;`CommandController` 用 `field.has("expectedFieldVersion")` 判断,故省略即按 null 处理)。
- **C.**(可选健壮)保存成功后 `refreshViews()` 已会重载新对象版本;无需额外处理。不改后端、不改命令语义。

## 封闭文件清单
**修改**:`packages/web/src/workbench/inspector-panel.tsx`、`packages/views/src/api/command-client.ts`;按需相关 `.test.ts(x)`。
**零碰**:后端、契约、迁移、视图查询、其它命令。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改命令 payload 结构(仅字段版本由"对象版本"改为省略/null)。
- 修复后:选中房间→改"宽/窗面积"→保存**成功(2xx)**,无 409;`refreshViews` 后节点/平面图的面积、窗地比、规则灯随之更新。
- 不新增依赖;`corepack pnpm verify` 全绿;只 add 本卡相关文件。
- 分支 `feat/T-V33-edit-409` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 选中"暗次卧"→把"窗面积"0.8 改 2.5→保存成功;窗地比由 0.078 升至约 0.245,规则灯按阈值刷新(可能由阻断转告警/达标)。
2. 改"宽"→面积芯片即时重算;连续多次保存均成功(版本随刷新前进)。
3. 底栏"错误"不再因保存增长;verify 全绿;无后端/契约 diff。
