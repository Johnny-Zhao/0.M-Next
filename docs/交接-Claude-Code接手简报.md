# 交接简报 — Claude Code 接手 M-Next

> 给接手的 Claude Code 看。仓库即本目录 `E:\0.M-Next`(真 git 仓库,原生跑 git/maven/pnpm/Docker)。建议把本文件要点并入根目录 `CLAUDE.md`(Claude Code 自动读)。
> **第一件事**:`git log --oneline -20` + `git branch` + `git status` 看清 main 真实状态(此前的开发经 Cowork+Codex,本简报作者无法独立核实,以仓库为准)。

## 0. 一句话
M-Next = 数据驱动 + AI 的多领域工程建模平台(《技术说明书 V3.3》)。模型优先、图/表/矩阵/文档皆为视图、改一处全联动、领域以可装卸插件扩展。**当前阶段:pre-alpha,端到端能跑,但 UX 粗、还不好用。**

## 1. 待验证 + 合并(Codex 刚完成的分支,在 Claude Code 里收口)
逐张:`git switch <branch>` → `git merge main` 拉平 → `corepack pnpm verify` → `node scripts\check-no-skipped.mjs`(看 `Skipped:0`)→ 人核 `git diff --stat main`(封闭、无越界)→ `git switch main && git merge --no-ff <branch>`。**后端三张错峰跑 Docker。建议合序:F-DOC → ③ → TECHDOC-A → MBSE-A。**
- `feat/T-V33-fdoc-a` — 文档生成接 OutputController(前端)。验:能选 Md/Docx/Pdf 生成并下载。
- `feat/T-V33-view-templates-a`(③)— 模板目录富字段 + TS 客户端(后端)。
- `feat/T-V33-techdoc-a` — 技术方案 profile seed(后端,domains 包 + 装卸 E2E)。验:装→实例化→规则灯→卸→重装。
- `feat/T-V33-mbse-a` — 任务剖面→需求→验证 profile seed(后端,同上)。
> 注:`TECHDOC-A`/`MBSE-A` 的领域模型是"按设计稿推荐的最简版",验收时按需增删类型/规则。

## 2. 红线 / 门禁(沿用,见 AGENTS.md)
写经命令入口(AG-110)· 视图只读零拷贝 · 契约/迁移人发起 · `Skipped:0`(不得带跳过测试合并)· 依赖矩阵 `architecture:check` · 封闭卡:分支提交、人验证后 `--no-ff` 合、**只 add 本卡相关文件** · **命中"需改契约/迁移/取不到 API"→ 停下回报,不夹带**。

## 3. 当前能跑什么(室内 P1)
- 已落:内核 CQRS + 元模型/模板 + 规则/派生 + 血缘 + 决策(AHP/TOPSIS/WPM)+ 评审 + 交换/渲染/仿真 SPI;插件机制(F0 撤下态 / F1 装卸 / F4 维度注册 / F5 面板注册 / F5b 控件库)+ **D-INTERIOR 室内首插件** + WEB-DEV + DEV-SEED + 可用化 UX-A/B/C。多 profile E2E 验证(energy/sysml/bus/室内)。约 5 万行代码。
- 本地启动:`docker compose up -d` → 后端 dev(**别用 `-pl ... spring-boot:run`**,会跑到父工程报无 main class;用 `java -jar packages\server\target\server-*.jar` 或进 `packages/server` 跑,`SPRING_PROFILES_ACTIVE=dev`)→ `corepack pnpm --filter @m-next/web dev` → http://localhost:5173 → HOME 点 demo 项目(workspace `11111111-1111-4111-8111-111111111111`)。

## 4. 权威文档指引(注意:架构稿有多份、仍在收敛)
- 产品:`docs/北极星-制图工作台-定稿.md`、`docs/北极星-统一真值的多重表达.md`、`docs/功能全集清单-制图工作台.md`。
- **架构最新方向**(模块=领域 / 子部分=profile · profile 四要素{元模型/功能/视图/流程} · 即需即装+能力市场 · 行业/专业/场景=过滤标签 · namespace `::` · extends 只增不改):`docs/架构-总纲-模块即需即装与能力市场.md` + `docs/扩展性架构-项目模块profile.md` + `docs/架构-能力条目目录与注册管理.md`。**尚未实现、仍需收敛;EXT-1..5 待做。先别动这套重构。** ⚠️ 这几份与早期的 `领域插件机制 / 模块目录与角色场景 / 行业模块` 有覆盖,接手后应**合并成一份权威总纲**。
- 领域:`docs/设计稿-室内设计profile.md`、`docs/设计稿-MBSE主线-任务剖面与接口管理.md`、`docs/设计稿-技术方案文档profile.md`。
- 计划/复盘:`docs/开发计划-下一阶段路线.md`、`docs/操作流程-到可运行真品.md`、(本轮复盘见对话)。
- 卡:`docs/tasks/T-V33-*`。

## 5. 战略要点(本轮复盘结论,务必带着做)
- **收敛**:停止扩领域、停止反复重构架构分类(角色/场景/行业那套已讨论过多)。
- **UX 优先**:后端远超前端,瓶颈是"能跑不好用"。边际投入压到 **室内闭环 + 外壳屏(登录/项目/新建/工作台)** 的可用化。
- **定一个商用楔子**(三选一):技术方案文档(可 dogfood V3.3,推荐)/ 室内合规校核 / 选型校核。
- **找 1 个真实用户**:把"自证有用"换成"有人真的用了"。
- **暂不做**:即需即装/市场/视角/流程引擎、EXT-2~5、标准联邦、联合仿真、知识语义、新领域 profile。

## 6. 设计→代码(减迭代)
用 Claude Design 出 **室内工作台 + 外壳屏** 稿 → 经 Claude Code 原生交接落地(Design 不直通 Figma;别绕)。设计先行减的是"长得对"的来回,不减"接数据"与"定战略"。

## 7. 接手后第一步建议
不是写新功能,而是:① 把 §1 这批验证合并;② 重启跑通、确认室内闭环"能演示"(新建→画户型→派生/规则灯/维度→F-DOC 出文档);③ 据此定楔子。
