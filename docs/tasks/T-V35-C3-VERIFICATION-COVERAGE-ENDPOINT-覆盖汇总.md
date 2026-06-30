# T-V35-C3 — 验证覆盖只读汇总端点(灯塔线·第三步)

> **packages/server 域,只读视图查询;零迁移、零写入语义变更。** 前置:C1(数据)、C2(裕度/覆盖规则)已合。
> 把"逐条需求的验证判定"按需求集**滚动汇总**,供 C4 仪表读。沿用 `/views/*` 只读零拷贝风格。

## 目标
提供一个只读端点:给定工作空间(或某 mission/需求集),返回**验证覆盖汇总**(已验证 / 未验证 / 失败的计数 + 缺口需求列表),数据来自读模型 + 规则/派生结果,**不现算重逻辑**。

## 现状(已核实)
- 读模型 rm_object/rm_relation;规则结果(check_result)/派生(verify_status_fx、C2 裕度)可查;矩阵/血缘/规则状态端点已在 `ViewQueryController`。
- requirement 经 verified_by→test_case→produces→test_result;状态由 C2 派生/规则判定。

## 范围(只读,零迁移)
- **A. 汇总端点** `GET /workspaces/{ws}/views/verification-coverage?scope`(scope 可选:mission/需求集):返回
  - 计数:`verified / unverified / failed`(按 C2 判定;未覆盖=无 verified_by 或无 result,失败=verdict fail 或裕度不达标,通过=其余)。
  - **缺口列表**(分页):未验证 + 失败的 requirement(id/code/text/状态/原因),供下钻。
- **B. 实现**:读 rm_*(requirement/关系)+ 规则结果/派生(复用既有查询;不重写判定逻辑,尽量引用 C2 的派生/规则产出);分页/上限。
- **C. 不改**:写入命令、读模型投影语义、规则/派生实现(只读取其结果)、其它端点。

## 封闭文件清单
**修改/新增**:`ViewQueryController`(端点)、`VerificationCoverageRepository` 或扩既有只读仓储(只读查询)、`ViewQueryDtos`(汇总 DTO)、view-client 只读方法(按需)、只读 E2E。
**零碰**:写入命令、读模型投影、规则/派生实现、迁移、前端视图(那是 C4)。

## 红线 / 门禁
- **只读视图查询,零迁移、零写入语义变更**;读 rm_* + 既有规则/派生结果,不重算、不触发计算。
- 分页/上限;大需求集性能稳。
- Docker 起着 `corepack pnpm verify` 全绿(`Skipped:0`,含只读 E2E)。
- 分支 `feat/T-V35-c3-verification-coverage` 从 main 起、提交不合并;`git merge main` 拉平;**实现完先 commit 再 verify**;只 add 本卡文件;发 `git diff --stat main` + 测试汇总。命中红线停下回报,不夹带。

## 验收
1. `GET /views/verification-coverage` 在 C1 三态数据上返回正确的 verified/unverified/failed 计数。
2. 缺口列表分页返回未验证+失败需求(含原因);只读、无写入/迁移 diff。
3. 现有功能零回归;verify 全绿 Skipped:0。

## 跟进(本卡不做)
C4 仪表前端;按 capability/phase 维度的覆盖透视;导出。
