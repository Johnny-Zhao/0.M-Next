# T-V33-TOASTS — 状态/错误轻提示(toast),替底栏数字 + 控制台红字

蓝本:`docs/design/M-Next 工作台.dc.html`(整体克制基调)。
**packages/web 域,纯前端,零后端/契约。** 前置:main。
定位:现在保存成功无反馈、出错只在底栏"错误 N" + 控制台红字,体验差。本卡加一套**轻量 toast**:保存成功/失败、读取失败等给右下角短暂提示,自动消失。

## 现状
- `app.tsx`:`onError` 只 `setErrors(v=>v+1)`,底栏显示"错误 {errors}";视图读失败抛 Error 进控制台。
- 字段保存成功仅 inspector 内 `setMessage("已保存")`(很弱)。

## 范围(纯前端)
- **A. Toast 容器/上下文**:新增 `packages/web/src/toast.tsx`——`ToastProvider` + `useToast()`,提供 `toast.success(msg)`/`toast.error(msg)`/`toast.info(msg)`;右下角堆叠、约 3s 自动消失、可手动关、支持多条。用 `--mn-*` 令牌(成功=ok、错误=bad、信息=accent),亮暗双主题。
- **B. 接入关键动作**:
  - 字段保存成功 → `toast.success("已保存")`;失败 → `toast.error(原因)`(复用现有 reportError 链路,转成 toast)。
  - 视图读取失败 → `toast.error("读取失败")`(去掉/弱化控制台红字噪声,至少不再只靠底栏数字)。
  - 文档导出成功/失败、删连线成功/失败等已有写动作 → 相应 toast。
- **C. 底栏**:保留"错误计数"作汇总,但主反馈走 toast;`onError` 既计数又弹 toast。
- **D. 不改**:命令/视图请求语义、数据逻辑;仅在结果回调处加提示。

## 封闭文件清单
**新增/修改**:`packages/web/src/toast.tsx`(新)、`packages/web/src/app.tsx`(挂 Provider + onError 弹 toast)、`packages/web/src/workbench/inspector-panel.tsx`(保存/失败弹 toast)、按需 `document-output-action.tsx` 等写动作处、`styles.css`、相关 test。
**零碰**:后端、契约、`packages/views` 数据逻辑、视图请求。

## 红线 / 门禁
- 纯前端;**零后端/契约**;不改任何请求/命令语义,只在回调处加提示。
- toast 不阻断操作、自动消失、可关闭;`--mn-*` 令牌、亮暗可用、克制(不滥用)。
- 不新增依赖(自己实现轻量 toast,不引库);`corepack pnpm verify` 全绿;零回归。
- 分支 `feat/T-V33-toasts` 从 main 起、提交不合并;`git merge main` 拉平;完成发 `git diff --stat main` + web 测试汇总。命中红线停下回报,不夹带。

## 验收
1. 改字段保存 → 右下角"已保存"绿 toast,3s 消失;保存失败 → 红 toast 写原因。
2. 制造一次读取失败(如断后端)→ 出错 toast,不只是底栏数字。
3. 导出文档成功 → toast 提示。
4. 亮暗主题下 toast 清晰;verify 全绿;无后端/契约 diff。
