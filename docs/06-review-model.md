# 06 — 评审模型设计稿(数据审阅与评价)

- 状态:设计稿(Claude 产出,待用户确认 → 转 Codex 任务卡 T-V33-R01)
- 依据:说明书"数据审阅与评价"、附录A `DataReview`(单条批注 `Annotation`);AGENTS.md AG-101/102/110/321/322;MVP-0 第 10/11/12 项(字段级评论 / 对象级评审 / 关系级评审)
- 定位:评审是**带定位、挂版本**的结构化数据,不是普通评论;评审**不修改主数据**

---

## 1. 设计原则(为何不能简化为评论)

1. **可定位**:批注必须锚定到字段级 / 对象级 / 关系级具体位置,而非一段自由文本挂在对象上。
2. **挂版本**:批注记录其锚定时的数据版本 `anchoredDataVersion`,数据改版后批注可判定"是否失锚",而不是默默错位。
3. **与主数据隔离**:评审在 `engines/review` 自有存储;**不得 import `kernel/internal`,不得 UPDATE/INSERT 任何主数据表**(AG-101/110 精神延伸——评审组只产出批注,不改高风险正式数据)。解决问题的数据修改走正常 M1 命令,评审只记录意见与状态。
4. **视图无副本**:前端评审面板只读评审查询端点,不持久化批注到 storage(AG-102)。

## 2. 三级锚定模型(统一寻址)

单条批注 `Annotation` 通过 `targetType + targetId (+ fieldCode | relationId)` 寻址:

| 级别 | targetType | targetId | 附加 | anchoredDataVersion 取自 |
|---|---|---|---|---|
| 字段级(MVP-0 #10) | `field` | 对象 id | `fieldCode` | `data_field_value.version`(该字段版本) |
| 对象级(MVP-0 #11) | `object` | 对象 id | — | `data_object.version` |
| 关系级(MVP-0 #12) | `relation` | 关系 id | — | `data_relation.version` |

同一协议 `(targetType,targetId,fieldCode?)` 与阶段5 线框 `SelectionRef` 对齐——评审面板点击批注可经 SelectionRef 反向高亮对应单元格/行/关系端点。

## 3. 数据模型(迁移,engines/review 自有,不碰 kernel 表)

```
review_round(                      -- 评审轮次(可选分组;MVP 可只用默认轮次)
  id UUID PK, workspace_id UUID NOT NULL,
  title VARCHAR(256), status VARCHAR(16) NOT NULL,   -- draft | in_review | closed
  created_by VARCHAR(64), created_at TIMESTAMPTZ)

annotation(
  id UUID PK,
  workspace_id UUID NOT NULL,
  round_id UUID NULL FK → review_round(id),
  target_type VARCHAR(16) NOT NULL,        -- object | field | relation
  target_id UUID NOT NULL,                 -- 对象 id 或 关系 id
  field_code VARCHAR(128) NULL,            -- 仅 field 级
  anchored_data_version BIGINT NOT NULL,   -- 锚定时目标版本
  severity VARCHAR(16) NOT NULL,           -- info | suggest | issue | block
  body TEXT NOT NULL,
  status VARCHAR(16) NOT NULL,             -- open | resolved | wontfix
  created_by VARCHAR(64) NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  resolved_by VARCHAR(64) NULL, resolved_at TIMESTAMPTZ NULL)

CREATE INDEX annotation_target_idx
  ON annotation (workspace_id, target_type, target_id, field_code);
```

约束:`target_type='field'` 时 `field_code` 必填;`target_type IN ('object','relation')` 时 `field_code` 必为 NULL(CHECK 约束)。批1 不建回复线程(`annotation_reply` 进批2)。

## 4. 评审命令面(独立端点,需契约附录 → 人工 spec-change)

> 同 M2:评审命令是新命令类型,需人工 spec-change(建议 `contracts/评审命令契约.md`),独立端点 `POST /workspaces/{id}/review/commands`,与 M1 `/commands` 分离。

| 命令 | 批次 | 语义 | 校验 |
|---|---|---|---|
| `CreateAnnotation` | 批1 | 建批注(三级之一) | 目标存在;field 级须 fieldCode 且该字段定义存在;anchoredDataVersion 由客户端传入(其当前所见版本) |
| `ResolveAnnotation` | 批1 | open → resolved | 仅 open 可解决;**不触碰主数据** |
| `ReopenAnnotation` | 批1 | resolved/wontfix → open | — |
| `CreateReviewRound`/`CloseReviewRound` | 批2 | 轮次管理 | — |

错误码前缀:评审不在 AG-311 现五前缀(KERNEL/RULE/PERM/AI/ARTIFACT)内 → **需人工决策**:新增 `REVIEW-` 前缀(AGENTS.md AG-311 修订,推荐,审计清晰),或暂复用 `KERNEL-`。本稿按 `REVIEW-` 设计:`REVIEW-404-TARGET-NOT-FOUND`、`REVIEW-422-FIELD-CODE-REQUIRED`、`REVIEW-409-INVALID-STATE-TRANSITION`。

审计:批注创建/状态变更填 `created_by/resolved_by`(取认证上下文,AG-321);评审域事件(`AnnotationCreated/AnnotationResolved`)非 M1 注册集 → 批1 暂不进 Outbox,经查询端点直读;通知/事件进批2(随 addendum)。

## 5. 失锚(stale)策略

批注创建时固化 `anchoredDataVersion`。当目标当前版本 > 锚定版本,该批注为**可能失锚**:

- **不自动删除、不自动失效**;读取时计算 `stale = currentVersion > anchoredDataVersion`,前端显示"基于 v3 的批注,当前 v5"(承线框 W-1.2"延迟/状态可见"理念)。
- **批1 不耦合 readmodel**:`currentVersion` 的获取依赖阶段5 读模型或一个窄内核读端口。为使批1 自包含,批1 **只固化 anchored_data_version,不计算 stale**;stale 显示在阶段5 读模型就绪后接通(批2 / 阶段5 联调)。批1 查询端点原样返回 `anchoredDataVersion` 供前端比对。

## 6. 隔离边界(CI 可验证)

- `engines/review` 仅依赖 `kernel/api`(只读,如需取版本)、`shared`;**禁止** import `kernel/internal`、任何渲染库(AG-101/103 类比)。
- 评审命令处理器事务内**禁止**调用任何 M1 写命令、禁止写 `data_object/data_field_value/data_relation`(architecture:check + SQL lint 验证)。
- 视图侧评审面板禁止把批注落 storage(AG-102)。

## 7. 批次与排期

- **批1 = T-V33-R01(MVP-0 关键)**:annotation/review_round 表、`CreateAnnotation/ResolveAnnotation/ReopenAnnotation` + review 端点、三级锚定校验、查询端点、单测。**前置:契约附录(人工)+ REVIEW- 前缀决策(人工)。**
- **批2 = T-V33-R02**:失锚计算接通读模型、回复线程、评审轮次、评审域事件入 Outbox、评审面板 UI(随阶段5)。
- **排期**:批1 仅依赖阶段1(对象/关系已存在),**可与 T-V33-201 并行**,不阻塞。

## 8. 验收口径(MVP-0 第 10/11/12 项)

对一个对象:在 `预算` 字段建字段级批注(severity=issue)、对整对象建对象级批注、对一条 `分解` 关系建关系级批注;查询端点按目标返回三条且锚定版本正确;`ResolveAnnotation` 后状态转 resolved 且**对象/字段/关系数据零变化**(断言主数据 version 不变)。

## 9. 禁止事项

不改 contracts/schemas/*.json 与 M1 注册集;评审命令不得写主数据、不得调 M1 写命令;不 import kernel/internal;不建 UI(批1 为后端);不引新依赖(AG-502);失锚不得自动删除批注。
