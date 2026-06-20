# T-V33-RBAC-A — RBAC 权限 MVP(Phase 1)

蓝本:`docs/RBAC权限-设计稿.md`(决策已定:四档角色、可信 X-Actor-Id、动作映射、创建者自动 ADMIN、自定义权限押 Phase 2)。前置在 main(v1.42)。**server 域 + V16 迁移 + 新契约 + 跨命令/视图鉴权前置**。含 Docker e2e——**与其它 server e2e 错峰**。体量大,**可同分支两提交**(1a 模型+Grant/Revoke+成员读;1b 鉴权前置接入各控制器),但**一张卡、一条分支 `feat/T-V33-rbac-a`**,verify 整体绿才回报。

## 核心模型:工作空间自举式治理(关键,先读)
- **未治理工作空间**(`workspace_member` 中该 wid 零行)= **开放**:任何 actor 视同 ADMIN(单租户可信自举)。**→ 现有所有 e2e(各自全新工作空间、无成员)全部不改、自动放行。**
- **已治理工作空间**(该 wid ≥1 行成员)= 强制 RBAC:按 `(actorId, wid)` 查角色,不足档位拒绝。
- **首个成员**:`GrantWorkspaceRole` 由该工作空间内已是 ADMIN 的 actor 发起;**在未治理工作空间里,发起者作为视同 ADMIN 可授出第一个角色**(自举成立)。

## 角色与动作映射(固定四档,Phase 2 才可自定义)
`VIEWER < AUTHOR < REVIEWER < ADMIN`。每个入口归一到一个动作类别,要求最低档位:

| 类别 | 端点/命令 | 最低角色 |
|---|---|---|
| 读视图/查询 | `GET /workspaces/{wid}/views/**`、成员读 | VIEWER |
| 写数据 | CommandController(CreateObject/CreateRelation/UpdateFields)、SimulationController(跑仿真)、Exchange/Snapshot 写 | AUTHOR |
| 评审/确认 | ReviewCommandController、RunRuleCheck 的确认类、(后续 AI 确认) | REVIEWER |
| 治理 | MetaCommandController(Define*/CreateTemplate/Publish/Instantiate)、RuleCommandController(DefineRule/PublishRule)、AttachmentCommand(Attach/Detach 归 AUTHOR;附件**删除**可 AUTHOR)、RbacCommand(Grant/Revoke)、资产发布(后续) | ADMIN(规则/元模型/模板/授权);写类见上 |

> 映射以本卡为准,落到 `contracts/权限矩阵.md`。边界判断有歧义的命令→停下回报,不自行归类。

## 范围

### A. 数据模型(`V16__rbac.sql`)
- `app_user`:`id uuid pk`、`display_name text`、`status text not null default 'ACTIVE'`(ACTIVE/DISABLED)、`created_at timestamptz default now()`。
- `workspace_member`:`workspace_id uuid`、`user_id uuid`、`role text not null`(VIEWER/AUTHOR/REVIEWER/ADMIN)、`granted_by text`、`granted_at timestamptz default now()`,主键 `(workspace_id, user_id)`。
- 索引 `(workspace_id)`(治理判定:count by wid)。

### B. 鉴权服务(新 `WorkspaceAuthorizer`)
- `void require(String actorId, UUID workspaceId, Action action)`:
  1. 若 `workspace_member` 该 wid **零行** → 放行(未治理自举);
  2. 否则:校验 actor 对应 `app_user` 存在且 ACTIVE(否则 `AUTH-401-UNKNOWN-ACTOR`);查 `(wid, userId)` 角色,`< action 要求档位` → `AUTH-403-FORBIDDEN`。
- `Action` 枚举映射到最低档位(上表)。纯只读判定,不写库。

### C. 鉴权前置接入(各控制器入口,**每处一行**)
在以下控制器的工作空间级入口方法开头调用 `authorizer.require(actorId, workspaceId, Action.X)`:
- 写:`CommandController`、`SimulationController`、`SnapshotController`、`ExchangeController`(写路径)、`AttachmentCommandController`、`AttachmentBlobController`(上传=AUTHOR);
- 评审:`ReviewCommandController`;
- 治理:`MetaCommandController`、`RuleCommandController`、`RbacCommandController`(自身 Grant/Revoke=ADMIN,但在未治理工作空间放行以自举);
- 读:`ViewQueryController` 及其它 `/views/**` 查询控制器(`AttachmentQueryController` 等)=VIEWER。
- **若某控制器入口取不到 workspaceId 或结构使"一行接入"不成立 → 停下回报,不强插。**

### D. 授权命令 + 成员读
- `RbacCommandController`(`POST /workspaces/{wid}/rbac-commands`,switch):`GrantWorkspaceRole`(`{userId, role}`)、`RevokeWorkspaceRole`(`{userId}`);写 `workspace_member` + `app_user`(被授用户不存在则建 ACTIVE 用户)+ outbox 事件可选;幂等走 command_log。
- 成员读:`GET /workspaces/{wid}/members`(只读、有界,返回 `[{userId, role, grantedBy, grantedAt}]`)。

### E. 契约(**人发起,本卡 §为准**)
- 新 `contracts/权限矩阵.md`(动作类别→最低角色表 + 自举规则)。
- 新 `contracts/schemas/rbac-commands.schema.json`(Grant/Revoke）。
- `packages/shared/contracts/error-codes.yaml` 追加 `AUTH-401-UNKNOWN-ACTOR`(401)、`AUTH-403-FORBIDDEN`(403)、`RBAC-400-SCHEMA-INVALID`、`RBAC-409-IDEMPOTENCY-CONFLICT`。
- `scripts/check-contracts.mjs` 注册 `rbac-commands`(追加,同 attachment 模式)。
- 夹具随契约(AG-406):`tests/contracts/fixtures/rbac-commands/{valid,invalid}/*.json`。

## 封闭文件清单

**新增**
- `packages/server/src/main/resources/db/migration/V16__rbac.sql`
- `packages/server/src/main/java/com/mnext/server/WorkspaceAuthorizer.java`
- `packages/server/src/main/java/com/mnext/server/RbacCommandController.java`
- `packages/server/src/main/java/com/mnext/server/RbacCommandDtos.java`
- `packages/server/src/main/java/com/mnext/server/RbacRepository.java`
- `packages/server/src/main/java/com/mnext/server/MembersQueryController.java` + `MemberViewDtos.java`
- `packages/server/src/test/java/com/mnext/server/RbacE2EIntegrationTest.java`
- `contracts/权限矩阵.md`、`contracts/schemas/rbac-commands.schema.json`
- `tests/contracts/fixtures/rbac-commands/{valid,invalid}/*.json`

**修改(每处仅追加鉴权一行 + 注入 authorizer)**
- `CommandController` / `MetaCommandController` / `RuleCommandController` / `ReviewCommandController` / `AttachmentCommandController` / `AttachmentBlobController` / `SimulationController` / `SnapshotController` / `ExchangeController` / `ViewQueryController` / `AttachmentQueryController`
- `packages/shared/contracts/error-codes.yaml`、`scripts/check-contracts.mjs`

**零碰**:kernel、engines、views/web、其它迁移/契约、领域逻辑(只在入口加横切)。

## 红线 / 门禁
- 写经命令入口(AG-110);鉴权是**入口横切只读判定**,不进领域逻辑、不写库(除 Grant/Revoke 自身);读写分离不破。
- **现有 25 个 e2e 必须全绿不改**(靠"未治理=开放"自举);若发现某测试因此被迫修改→停下回报(说明哪条假设不成立)。
- 不引新依赖;契约/错误码/夹具随卡(AG-406);错误码前缀 `AUTH-`/`RBAC-`(AG-311)。
- `corepack pnpm verify` 全绿 + jacoco≥0.80;Docker 起、server 汇总 **`Skipped:0`**(+ `node scripts/check-no-skipped.mjs`)。**与其它 server e2e 错峰**。
- AG-405 落盘自检;**分支 `feat/T-V33-rbac-a` 提交不合并**;基线落后只 `git merge main`;完成发 `git diff --stat main` + server 测试汇总行。
- 若鉴权前置需改领域逻辑、或某控制器无法一行接入、或自举模型与某现有测试冲突——**停下回报,不夹带**。

## 验收(集成测试,RbacE2EIntegrationTest)
1. **自举**:全新工作空间(无成员)→ 任意 actor 可建对象/Define*(放行);
2. **首授**:actor A 在该工作空间 `GrantWorkspaceRole(B, VIEWER)` → 自此工作空间转入治理;
3. **强制**:B(VIEWER)写对象 → `AUTH-403`;B 读视图 → 200;A(此时应是 ADMIN——见自举:首个授权者落 ADMIN 记录,或 A 先自授 ADMIN)Define* → 200;
4. **档位**:授 C=AUTHOR → 写对象 200、但 Define*/Grant → 403;授 D=REVIEWER → 评审命令 200;
5. **未知 actor**:治理工作空间内用未建/DISABLED 的 actor → `AUTH-401`;
6. **跨工作空间**:A 在 wid1 是 ADMIN,在已治理的 wid2 无成员 → wid2 操作 403;
7. 幂等:同 idempotencyKey 重放 Grant 不重复;非法 role/schema → `RBAC-400`。
- **回归**:确认现有 server 测试套仍全绿(未治理自举生效)。

## 跟进(Phase 2,本卡不做)
- SSO/JWT 网关、自定义角色 + 权限位矩阵、字段/对象级 ACL、组织树;
- 视图读的更细范围控制;AI 变更确认接 REVIEWER 门;资产发布接 ADMIN 门。
