# T-V33-WB-LOOP — 修工作台视图加载死循环(纯前端)

**packages/web 域,纯前端,零后端/契约。** 前置:main。
**严重 bug**:进入工作空间后,图/表/矩阵面板**不显示任何数据**,页面**卡死**,底栏"错误"数狂涨(实测 1800+)。后端 API 正常(`/views/objects?objectType=room` 直接返回 6 间房),问题纯在前端。

## 根因(已定位)
`packages/web/src/app.tsx` 第 ~110 行,传给 `<Workbench>` 的 `onError` 是**内联箭头函数**:
```jsx
onError={() => setErrors((value) => value + 1)}
```
每次渲染都新建 → 它进了 `workbench.tsx` 的 `context = useMemo(..., [..., reportError])` 依赖 → **context 每渲染都变** → `diagram-panel.tsx` / 各面板的 `useEffect(load, [context])` **每渲染都重跑** → load 出错就调 `onError` → `setErrors` → 再渲染 → 死循环。错误累加、主线程卡死、数据永远 set 不进去。

## 范围(最小改动)
- **A. 稳定 onError**:`app.tsx` 用 `useCallback` 固定 onError 身份:
  ```jsx
  const reportError = useCallback(() => setErrors((value) => value + 1), []);
  // ...
  <Workbench ... onError={reportError} ... />
  ```
- **B. 复核其它 context 依赖稳定性**:确认 `workbench.tsx` 里 `context` useMemo 的其余依赖(setObjectType/setRelationType/setRootId/refreshViews/viewClient/commandClient/selection 等)都已是稳定身份(useState/useCallback)。若发现别的内联/每渲染重建项,一并 useCallback/useMemo 固定。**不改查询语义、不改默认值。**
- **C.(防御)** `diagram-panel.tsx` 等面板的 load effect:可选地把依赖从整个 `[context]` 收窄为真正用到的原子值(workspaceId/objectType/relationType/rootId/refreshVersion),进一步防止无谓重跑。**仅在不改行为前提下做;拿不准就只做 A+B。**

## 封闭文件清单
**修改**:`packages/web/src/app.tsx`(必改);按需 `packages/web/src/workbench/workbench.tsx`、`packages/web/src/workbench/diagram-panel.tsx`(仅依赖稳定性,不改逻辑);按需相关 `.test.tsx`。
**零碰**:后端、契约、迁移、`packages/views` 数据逻辑、样式令牌、查询语义、默认值。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改查询语义/默认值/样式。
- 修复后:进入"技术方案A"工作台,**图面板显示 6 个房间方块**(客厅/主卧/暗次卧/厨房/卫生间/西晒书房),房间间有相邻连线;表格面板列出 6 行;底栏"错误"数稳定在 0(或个位数,不再狂涨);页面不卡死。
- 不新增依赖;`corepack pnpm verify` 全绿;对其它视图无回归。
- 分支 `feat/T-V33-wb-loop` 从 main 起、提交不合并;`git merge main` 拉平;**只 add 本卡相关文件**;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 进入工作台,画布默认呈现 6 个房间(room/adjacent),不卡死,错误数不增长。
2. 点中"暗次卧",右侧属性/校验显示其字段 + 红色规则灯(BLOCK)。
3. verify 全绿;无后端/契约 diff。
