# RBAC 权限 MVP — 设计稿(待人确认后才发实现卡)

> 状态:**设计征求**。本稿提出用户/角色模型、授权粒度、命令入口鉴权、与审计/AI/资产的衔接。其中契约新增(鉴权头/命令/读端点/迁移)属 AG-301/501 人发起,需你逐项拍板后才开实现卡。先定边界,再写代码。

## 1. 为什么 / 边界

平台的审阅、协同、资产审核发布、AI 变更确认**全都假定"谁有权做什么"**;目前只有命令头 `X-Actor-Id`(一个字符串身份,无角色、无校验)。RBAC MVP 把"身份 + 角色 + 工作空间级授权"补上,作为多用户与后续 AI 执行层/资产审核的共同前置。

**非目标(本期不做)**:SSO/LDAP/OIDC 对接、组织树/部门、字段级/对象级细粒度 ACL、动态策略引擎(ABAC)。这些押后。

## 2. 关键决策(每条给推荐 + 备选,待你确认)

### D1 身份从哪来 —— 推荐:仍走命令/请求头,但**校验**存在性 + 启用态
- **推荐**:保留 `X-Actor-Id`(=user_id),但服务端校验该用户存在且启用;**不做登录会话/JWT**(MVP 假设上游网关或可信调用方注入身份)。
- 备选:内建登录 + 会话 + JWT——超出 MVP,押后。
- 理由:最小改动接住"身份可信"假设;真实鉴权(SSO/JWT)作为 Later 的网关层。

### D2 角色模型 —— 推荐:**工作空间级四档固定角色**
- `VIEWER`(只读视图)< `AUTHOR`(建模/改数/跑分析)< `REVIEWER`(评审/确认/驳回 + AUTHOR)< `ADMIN`(配模板/定义元模型/管成员/发布资产 + REVIEWER)。
- **固定四档、不做自定义角色**(MVP);权限按"动作类别"映射到档位(见 D3)。
- 备选:自定义角色 + 权限位矩阵——灵活但重,押后。

### D3 授权粒度 —— 推荐:**工作空间 × 角色 × 动作类别**
- 授权 = `(user_id, workspace_id, role)`;每个写动作归一到一个**动作类别**,类别要求最低档位:
  - 读视图/查询 → `VIEWER`;
  - 对象/关系/字段写(CreateObject/CreateRelation/UpdateFields)、跑仿真 → `AUTHOR`;
  - 评审命令、AI 变更确认、检查批次确认 → `REVIEWER`;
  - 元模型/模板命令(Define*/CreateTemplate/Publish/Instantiate)、成员授权、资产发布 → `ADMIN`。
- **跨工作空间无授权 = 拒绝(403)**;同一用户在不同工作空间可不同角色。
- 备选:每命令独立权限位——更细但 MVP 不需要。

### D4 鉴权落在哪 —— 推荐:**命令入口统一前置 + 视图查询统一前置**
- 在各 `*CommandController` 入口(或一个统一 `AuthorizationFilter`/拦截器)按 `(actorId, workspaceId, commandType→类别)` 查授权,不足档位 → `AUTH-403-FORBIDDEN`;身份不存在/停用 → `AUTH-401-UNKNOWN-ACTOR`。
- 视图查询(`/views/*`)要求 ≥ `VIEWER`。
- **读写分离不破**:鉴权是入口横切,不进领域逻辑;失败早返回。
- 备选:每个 handler 内自查——分散、易漏,否。

### D5 与现有机制衔接
- **审计**:`audit_log` 记录里带 `role`(执行时的档位),满足 §7.13"谁、是否有权"。
- **AI 执行层(后续)**:AI 变更集的"写入正式数据"复用 REVIEWER 确认门;AI 本身以发起者身份 + 角色受限。
- **资产审核发布(后续)**:`ADMIN` 才能发布资产。
- **幂等/命令日志**:不变。

### D6 数据模型(迁移 `V16__rbac.sql`)
- `app_user`:`id`、`display_name`、`status(ACTIVE/DISABLED)`、`created_at`。
- `workspace_member`:`workspace_id`、`user_id`、`role(VIEWER/AUTHOR/REVIEWER/ADMIN)`、`granted_by`、`granted_at`,主键 `(workspace_id, user_id)`。
- 读模型/缓存:授权检查走主表即可(量小);如需 `rm_*` 投影留后续。
- **种子**:迁移内置一个 bootstrap 超级用户(或约定:工作空间创建者自动 ADMIN)——见开放问题 Q4。

## 3. 契约新增清单(**人确认项**)

| # | 新增 | 类型 | 红线 |
|---|---|---|---|
| C1 | 请求头 `X-Actor-Id` 语义升级(校验存在+启用) | 约定 | 不破现有调用,失败 401 |
| C2 | 授权管理命令 `GrantWorkspaceRole` / `RevokeWorkspaceRole`(ADMIN) | 命令契约 + schema | AG-110/301/501 |
| C3 | 用户/成员读端点 `GET /workspaces/{wid}/members`、`GET /users/{id}` | 查询契约 | 只读有界 |
| C4 | `V16__rbac.sql`(app_user + workspace_member) | Flyway | 迁移随契约 |
| C5 | 命令入口/视图鉴权前置 + 错误码 `AUTH-401/403` | 横切 + error-codes.yaml | AG-311 |
| C6 | 各命令 commandType→动作类别→最低角色 映射表 | 文档 `contracts/权限矩阵.md` | 闭单 |

## 4. 分期落地(确认后开卡)

- **Phase 1(MVP)**:V16 迁移 + 鉴权前置(命令+视图)+ Grant/Revoke 命令 + 成员读端点 + 权限矩阵 + e2e(VIEWER 越权写→403、AUTHOR 写 OK、ADMIN 才能 Define*/Publish、未知 actor→401、跨 workspace→403)。**Docker e2e,与其它 server e2e 错峰。**
- **Phase 2(后续)**:SSO/JWT 网关、自定义角色、字段/对象级 ACL、组织树。

## 5. 开放问题(请你定)

1. **身份来源**:MVP 就用"可信 `X-Actor-Id`(校验存在+启用)"、不做登录会话?(推荐 是)
2. **角色档位**:四档 VIEWER/AUTHOR/REVIEWER/ADMIN 够用吗?要不要单独拆"模板/元模型管理员"与"成员管理员"?
3. **动作映射**:D3 的类别→档位映射(写=AUTHOR、确认=REVIEWER、元模型/发布=ADMIN)认可吗?
4. **Bootstrap**:工作空间创建者自动成 ADMIN,还是迁移内置一个全局超级用户?(推荐 创建者自动 ADMIN)
5. **现有测试冲击**:大量现有 e2e 用裸 `X-Actor-Id`(无 member 记录)。鉴权上线后它们会 401/403。**方案**:测试夹具统一给 actor 建 user + 授 ADMIN(改测试基类,不算业务代码);或 MVP 加一个"未配置成员的工作空间默认放行"的兼容开关(不推荐,留后门)。倾向**前者**——你认可吗?

---

定了 1–5 + 契约清单 C1–C6 后,我把 Phase 1 切成实现卡(封闭文件清单 + 验收)发 Codex。Q5 尤其要先定,否则鉴权一上线现有 113 个测试会集体红。
