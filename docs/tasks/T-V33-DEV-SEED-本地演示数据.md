# T-V33-DEV-SEED — 本地演示数据(dev 启动装室内插件 + 实例化样板户型)

蓝本:`docs/里程碑-本地可运行真实工具.md`。**packages/server 域,仅 `dev` profile 生效。** 前置:**main 含 F1(ProfileLoader)+ D-INTERIOR(室内插件清单)**。

## 定位
让本地 `dev` 启动后 HOME 一打开就有**真项目**可点进去用:dev 专用 bootstrap 在空库上**装室内设计插件 + 实例化一个 demo 工作空间 + 画一套样板户型**(全走真实命令路径,不是塞假数据)。**只在 dev 生效,prod/test 绝不触发;幂等。**

## 范围
- **`@Profile("dev")` 的 `ApplicationRunner`/`CommandLineRunner`**(如 `DevSeedRunner`),启动时:
  1. 若室内插件未装 → 调 **F1 `ProfileLoader.install`** 装 `interior-design`(读 D-INTERIOR 的 `profile.manifest.json`);**幂等**:已装跳过。
  2. 若 demo 工作空间不存在 → 用**固定 id** `11111111-1111-4111-8111-111111111111`(对齐 `home.tsx` 的 placeholder/fallback)`instantiateWorkspace` 出 demo 空间。
  3. 经真实数据命令(CreateObject/CreateRelation)建一套样板:1 floorplan + 5~6 room(客厅/主卧/次卧/厨房/卫生间/书房),含长宽/窗面积/采光/换气/温度,connect `contains`/`adjacent`;**故意制造**采光 BLOCK(暗次卧)、通风 WARN(单窗主卧)、热 WARN(西晒书房)各一,便于看规则灯。
  4. 投影/追平读模型,使 `/views/*` 立即可查。
- **dev profile 接线**:`application-dev.yml`(datasource 指向本地 compose postgres:`jdbc:postgresql://localhost:5432/mnext`,user/pass `mnext`)。
- **守护**:`@Profile("dev")` + 启动日志打印"DEV SEED: installed interior-design, demo workspace ready";**绝不在 default/test/prod profile 运行**(test 用 testcontainers,不得被污染)。

## 封闭文件清单
**新增**:`packages/server/src/main/java/com/mnext/server/dev/DevSeedRunner.java`、`packages/server/src/main/resources/application-dev.yml`。
**修改**:无(HOME 已用该 placeholder id;若需让 HOME 真列工作空间,属③/后续,不在本卡)。
**零碰**:default/test 配置、命令/事件契约、迁移、业务逻辑;不改 prod 行为。

## 红线 / 门禁
- **仅 dev**:`@Profile("dev")`,prod/test 零影响;**不得**进默认 profile、不得污染 testcontainers e2e。
- 全走**真实命令路径**(F1 装载 + 数据命令),**不直插表造假数据**;幂等(重启不重复建/不报错)。
- 不新增依赖;不加迁移。`corepack pnpm verify` 全绿、server `Skipped:0` 不受影响(seed 不在 test profile 跑)。
- 分支 `feat/T-V33-dev-seed` 提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + 启动日志截图/片段。

## 验收
1. `SPRING_PROFILES_ACTIVE=dev` 起 server(连本地 postgres)→ 日志显示已装插件 + demo 工作空间就绪。
2. `GET /views/templates` 含"室内设计";`GET /workspaces/1111…/views/tree` 返回户型+房间;规则灯查询有 BLOCK/WARN/OK。
3. 前端(WEB-DEV proxy)打开 → HOME 点 demo 项目 → 工作台显示样板户型,可选房间、改尺寸、切风热光维度。
4. **幂等**:重启 server 不重复建、不报错。
5. **隔离**:`SPRING_PROFILES_ACTIVE` 非 dev 时 seed 不运行;`pnpm verify`/e2e 不受影响。

## 跟进
HOME 真列工作空间(需"列 workspace"端点,后续);更多样板(能源/SysML);一键 `compose + server + web` 启动脚本。
