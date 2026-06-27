# T-V33-FLOORPLAN-LAYOUT — 户型平面图真实空间布局(数据驱动)

蓝本:`docs/design/M-Next 户型工作台.dc.html`。
**涉及 packages/domains/interior-design(manifest)+ packages/server(DevSeedRunner 种子)+ packages/web(floorplan-panel)。** 前置:main(已含 FLOORPLAN-VIEW)。
定位:现平面图按面积"堆"成网格,不像真户型。本卡给房间**真实平面坐标**(数据驱动),面板按坐标 + 尺寸渲染,呈现像样板户型一样的平面图——demo 的视觉中心。

## 现状
- 平面图面板 `floorplan-panel.tsx` 按面积缩放成块、紧凑排布(示意,非空间布局)。
- room 有 `length_m`/`width_m`(房间尺寸),但**无平面坐标**。

## 范围
- **A. manifest 加平面坐标字段**(`packages/domains/interior-design/profile.manifest.json`):room 增加 `plan_x`、`plan_y` 两个字段(valueType `length_m`,`required:false`)——房间左下角在户型平面里的米坐标。**加法、不改既有字段。**
- **B. DevSeedRunner 种入坐标**(`packages/server/.../DevSeedRunner.java` 的 `roomFields`/各房间):给 6 间房一套构成公寓的坐标(左下为原点,单位米),例如:
  - 客厅(5.6×4.2):plan_x=0, plan_y=0
  - 厨房(3.2×2.4):plan_x=5.6, plan_y=0
  - 卫生间(2.4×2.0):plan_x=5.6, plan_y=2.4
  - 主卧(4.2×3.6):plan_x=0, plan_y=4.2
  - 暗次卧(3.4×3.0):plan_x=4.2, plan_y=4.2
  - 西晒书房(3.6×2.8):plan_x=7.6, plan_y=4.2
  （构成下方客厅+厨卫、上方三卧/书房的两带式公寓;坐标可微调到不重叠、紧凑。）
- **C. floorplan-panel 按坐标渲染**:房间矩形位置 = (plan_x, plan_y) 映射到画布(给一个 px/米 比例,y 轴按"上北"或"下为低 y"统一);尺寸 = length_m × width_m 等比缩放;**有坐标走真实布局,缺坐标回退现有示意排布**。块内仍:房间名 + 面积芯片 + 角标规则灯;维度切换原地重着色;点选→编辑→联动(复用现有)。
- **D. 不改**:写入语义、乐观锁、派生/规则计算、其它视图。

## 封闭文件清单
**修改**:`packages/domains/interior-design/profile.manifest.json`、`packages/server/src/main/java/com/mnext/server/DevSeedRunner.java`、`packages/web/src/workbench/floorplan-panel.tsx`、`packages/web/src/styles.css`、相关 test。
**零碰**:命令/写入、Flyway 迁移(plan_x/plan_y 是 JSON 字段值,无需迁移)、其它面板/领域。

## 红线 / 门禁
- manifest/seed 为**加法**(新字段、不改既有);坐标是真实数据,面板缺坐标要安全回退。
- 不改写入语义/乐观锁/派生规则;不新增 Flyway 迁移(字段值存 rm_object.fields JSON)。
- 不新增依赖;`corepack pnpm verify` 全绿(含后端 E2E,DevSeedRunner 改动需保持 seed E2E 通过);只 add 本卡相关文件。
- 分支 `feat/T-V33-floorplan-layout` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + 测试汇总。命中红线(尤其要动迁移/写入)停下回报,不夹带。

## 验收
1. dev 重置+重起后,进"平面图":6 间房按公寓样**真实平面摆放**(客厅在下、卧室在上、厨卫一角),尺寸成比例,不重叠。
2. 块内房间名 + 面积芯片 + 角标灯;切光/热/风原地重着色;点暗次卧改窗面积→保存→该块联动刷新。
3. 缺坐标的对象(其它工作空间)平面图仍能回退示意排布、不报错。
4. verify 全绿(含后端 E2E);无迁移/写入 diff。

## 跟进(本卡不做)
可拖拽调整布局并落库;真实墙体/门窗绘制;演示脚本与新建向导接通(另卡)。
