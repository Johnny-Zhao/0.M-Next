# T-V33-PLUGIN-F4 — DimensionRegistry + 注销(前端基建)

蓝本:`docs/设计稿-领域插件机制.md` §3 F4 + §5bis 装卸(决策 B)。**packages/web 域,纯前端、零后端/契约。** 前置:main(含 p3c 的 `dimensions.ts`)。

## 定位
把写死的 `DIMENSIONS` 常量改成**注册表**:core 内置注册 energy/thermal/mass;暴露 `registerDimension()`/`unregisterDimension()`,让领域插件**装时注册、卸时注销**自己的维度(室内插件注册 风/光,见 D-INTERIOR)。**不改 core 维度集本身、不改切换器/叠加逻辑;对现有三维度行为零变化。**

## 现状(已核实)
- `dimensions.ts` 导出 `DIMENSIONS`(写死数组)、`DimensionId`(联合类型 energy|thermal|mass)、`ActiveDimensionId`、`fieldDimension`、`groupByDimension`。
- 消费者:`diagram-panel.tsx`(import `DIMENSIONS`/`fieldDimension`/`ActiveDimensionId`,遍历 DIMENSIONS 找当前维度)、`object-node.tsx`(import 类型 `DimensionId`)。

## 范围
改 `packages/web/src/workbench/dimensions.ts`:
- **类型放开**:`DimensionId` 由联合类型改为 `string`(插件可扩);`ActiveDimensionId = DimensionId | "all"` 不变。`groupByDimension` 返回 `Record<string, readonly DimensionField[]>`(按已注册维度动态建桶)。
- **注册表(模块内单例)**:
  - `registerDimension(def: DimensionDefinition): void`——同 id 重复注册幂等覆盖;
  - `unregisterDimension(id: string): void`;
  - `listDimensions(): readonly DimensionDefinition[]`——替代直接读常量(保留 `match` 顺序=注册顺序,`fieldDimension` 取首个命中);
  - `resetDimensions(): void`(测试用,恢复仅内置)。
- **内置注册**:模块加载时注册 energy/thermal/mass(沿用现有 match 规则),作为 core 默认;**无插件时行为与现状完全一致**。
- **消费者改读注册表**:`diagram-panel.tsx` 用 `listDimensions()` 取代 import 常量;`fieldDimension`/`groupByDimension` 内部走注册表。`object-node.tsx` 的 `DimensionId` 类型仍可用(现为 string)。
- 保留并对齐顶部 `TODO(view-API)` 注释(命名约定临时,待元模型 dimension 标签 + view-API 替换)。

## 封闭文件清单
**修改**:`packages/web/src/workbench/dimensions.ts`、`dimensions.test.ts`、`diagram-panel.tsx`(改读 `listDimensions()`)、`object-node.tsx`(若类型需要)。
**零碰**:后端、契约、迁移、`packages/views`、切换器/叠加/选择/位置逻辑本体、p2c 边/端口。

## 红线 / 门禁
- 纯前端;**对现有 energy/thermal/mass 行为零回归**(切换/叠加/位置不变);命名约定临时、注释标清;不新增依赖。
- 注册表为模块内单例;`unregisterDimension` 干净移除(注销后该维度不再出现在切换器/分组)。
- 分支 `feat/T-V33-plugin-f4` 从当前 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + `pnpm --filter @m-next/web test` 汇总。

## 验收(vitest)
1. 默认(无插件):`listDimensions()` = energy/thermal/mass;`fieldDimension('energy_x')='energy'` 等与现状一致;切换器/叠加快照不变(位置/连线不动)。
2. **注册**:`registerDimension({id:'light',...})` 后 `listDimensions()` 含 light;`fieldDimension('light_df')='light'`;不影响内置。
3. **注销**:`unregisterDimension('light')` 后不再含 light;`fieldDimension('light_df')=null`;内置仍在。
4. **幂等**:重复注册同 id 覆盖不重复;`resetDimensions()` 恢复仅内置。
5. `groupByDimension` 按当前注册集动态分桶(含/不含插件维度两种)。
6. `corepack pnpm verify` 全绿;无后端/契约/迁移 diff;无新依赖。

## 跟进(本卡不做)
风/光维度的**注册**由 D-INTERIOR 插件做(本卡只建注册表+内置);F5 面板/stencil 注册表;③-正式 元模型 dimension 标签替换命名约定。
