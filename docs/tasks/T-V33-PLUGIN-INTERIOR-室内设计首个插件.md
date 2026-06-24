# T-V33-PLUGIN-INTERIOR — 室内设计:首个可装卸领域插件(domains 包 + 清单 + 注册维度 + 装卸 E2E)

蓝本:`docs/设计稿-领域插件机制.md` §4 + `docs/设计稿-室内设计profile.md` §2(决策 B)。**新增 `packages/domains/interior-design`(前端包)+ 后端装卸 E2E。** 前置:**F1(ProfileLoader)+ F4(DimensionRegistry)已并入 main。**

## 定位
把"室内设计"做成**第一个真正的领域插件**:自包含、可装卸,**不改 core**。证明"换插件即换领域"。插件 = 声明式 profile 清单(经 F1 装载)+ 前端维度注册(经 F4)。

## 范围

### A. 领域包 `packages/domains/interior-design/`
- `plugin.json`(描述符):`{ id:"interior-design", name:"室内设计", version:"1.0.0", profileManifest:"./profile.manifest.json", frontendModule:"./src/register.ts" }`。
- `profile.manifest.json`(F1 的 `ProfileManifest` schema,内容=`设计稿-室内设计profile.md` §2):
  - 值类型:length_m/area_m2/ratio/percent/lux/temp_c/u_value/ach(basePrimitive number)。
  - 对象类型:`floorplan`(name,floor);`room`(name,usage,length_m,width_m,orientation,window_area_m2,light_df,light_illuminance,thermal_temp,thermal_u,thermal_load,wind_ach);(可选)`wall`/`opening`。
  - 派生:room `area_fx = field('length_m')*field('width_m')`、`window_floor_ratio_fx = field('window_area_m2')/field('area_fx')`;floorplan `total_area_fx = sum(traverse('contains','out'),'area_fx')`。
  - 关系:`contains`(floorplan→room)、`adjacent`(room→room)。
  - 规则:`R-LIGHT-01` BLOCK `field('light_df')<2`;`R-LIGHT-02` WARN `field('window_floor_ratio_fx')<0.14`;`R-WIND-01` WARN `field('wind_ach')<1.0`;`R-THERMAL-LO` WARN `field('thermal_temp')<18`;`R-THERMAL-HI` WARN `field('thermal_temp')>26`。
  - **只用现成算子/DSL(field/*/sum/traverse、单比较)**;若需 OR/区间或新算子 → 拆规则;仍不行 → **停下回报,不夹带**(同 F1)。
- `src/index.ts`(**反转设计:domain 只导出数据,绝不 import web/F4**):`export const interiorDimensions = [{id:"light",label:"光",description:…,match:(c)=>/^light[_-]|采光|照度|lux/i.test(c)}, {id:"wind",label:"风",description:…,match:(c)=>/^wind[_-]|通风|换气|ach/i.test(c)}] as const`(普通对象,结构化匹配 web 的 `DimensionDefinition`,**不 import 任何 web 符号**);并 `export const interiorPluginId = "interior-design"`。**注册动作由 web 做(见 §B),domain 不依赖 web。**

### B. 工程接入 + 架构规则(F6 约定;架构改动已人授权)
- `pnpm-workspace.yaml` 增 `packages/domains/*`;domain 包 `package.json` name `@m-next/domain-interior-design`。
- **架构规则(已授权改 `architecture/dependencies.json`)**:加 `"domain-interior-design": []`(domain 只可依赖 shared——若用到 shared 类型则 `["shared"]`;**永不依赖 web/views/其它 domain**)+ 把 `web` 改成 `["views","shared","domain-interior-design"]`(组合根装配已装插件)。`corepack pnpm architecture:check` 必须过。
- web 侧**已装插件装配点**(如 `packages/web/src/plugins.ts`):`import { interiorDimensions } from "@m-next/domain-interior-design"` → 遍历调 web 自己的 `registerDimension(d)`;卸载点调 `unregisterDimension(interiorDimensions.map(d=>d.id))`。**注册逻辑在 web 这侧(web→domain 单向),domain 不反向依赖 web。** 本批只装配 interior-design 一个;从装配点移除 = "卸"。

### C. E2E(证装卸)
- **后端**(走 F1):读 `profile.manifest.json` → `install` → `/views/templates` 含"室内设计" → `instantiate` → 建 floorplan+rooms+contains+adjacent → 断言 area_fx/窗地比/total_area_fx + 规则灯(暗区 R-LIGHT-01 BLOCK 命中、达标不命中,通风/热各一命中) → 改窗面积重算翻灯 → **`uninstall` → 目录不含、不可新实例化、已建工作空间仍可用** → 重装恢复。
  - 清单路径跨模块:server 测试若不能直接读 `packages/domains/...` → 在 server 测试资源放一份**指向同内容的副本**(单一规范源在领域包,构建期拷贝);**若需改构建才能拷 → 停下回报**。
- **前端**(vitest):`registerInteriorDesign()` 后 F4 `listDimensions()` 含 光/风、`fieldDimension('light_df')='light'`/`'wind_ach'='wind'`;`unregisterInteriorDesign()` 后移除、内置仍在。

## 封闭文件清单
**新增**:`packages/domains/interior-design/`(plugin.json、profile.manifest.json、src/index.ts、package.json、前端测试)、`packages/server/src/test/java/com/mnext/server/InteriorPluginInstallE2EIntegrationTest.java`(+ 必要时清单副本资源)、`packages/web/src/plugins.ts`(已装插件装配点)。
**修改**:`pnpm-workspace.yaml`(加 domains/*)、`architecture/dependencies.json`(加 domain-interior-design + web 准依赖它,**已人授权**)、web 启动处调用装配点。
**零碰**:kernel/engines/server core 业务逻辑、命令/事件契约、求值逻辑、迁移、core `dimensions.ts` **内置集与注册表实现**(只调用,不改)。

## 红线 / 门禁
- **依赖方向**:domain **绝不 import web/views/F4**(只导出数据);web→domain 单向,经已授权的架构规则;`architecture:check` 过。domain 之间互不依赖。
- **不改 core**:profile 经 F1 装载(数据)、维度由 web 用 F4 的 `registerDimension` 注册插件导出的数据;**core 业务逻辑与 `dimensions.ts` 实现一行不改**(仅 pnpm-workspace / dependencies.json / web 装配点这类约定接线;架构规则改动已人授权)。
- **可装卸**:E2E 必含 装→实例化→卸(非破坏,老工作空间仍可用)→重装。
- 不臆造 DSL(见 A);不新增依赖;`corepack pnpm verify`/server 构建全绿;Docker 起、server 汇总 **`Skipped:0`**(+ check-no-skipped);与其它 e2e 错峰;jacoco 不降。
- AG-405 落盘自检;分支 `feat/T-V33-plugin-interior` 从当前 main(含 F1+F4)起、提交不合并;基线落后只 `git merge main`;完成发 `git diff --stat main` + 测试汇总行。
- **若装载需改契约、清单需改构建才能被 server 读、或规则 DSL 表达不了 → 停下回报,不夹带。**

## 验收
见 §C(后端装卸 E2E + 前端注册/注销 vitest)。回归:其它 profile/视图/维度不受影响;无 core 业务逻辑 diff、无业务迁移。

## 跟进(本卡不做)
室内 P2–P6 模块(功能区/选材/风格/软装/水电暖通/硬装/报价/智能家居)各自扩清单 + ★engine(经 SPI);把 energy/sysml/bus 迁成插件;F5 stencil/面板注册表后室内贡献控件库。
