# ADR-012：Ant Design 基础交互组件库受控接入

- 日期：2026-07-24
- 状态：Accepted

## 背景

UniSource 已有自定义视觉系统和大量基础组件，`--us-*` token 是现有视觉事实源。
同时，工程数据工作台需要 Tree、Modal、Form、Select、Dropdown 等成熟交互能力。
全量替换既有 UI 会扩大风险，也会破坏已经完成的 Grid、Canvas、Doc、Matrix、BI、ANA
表达，因此不采用默认 Ant Design 后台样式或一次性迁移方案。

## 决策

固定使用已批准的 `antd@6.5.1`。仅允许
`packages/web/src/unisource/ui/**` 中的 UniSource adapter 从根包 `antd` 导入组件；
业务页面不得直接导入 Ant Design，且禁止任何 `antd/**` 深路径导入。

样式必须通过 `ConfigProvider`、`prefixCls="us-ant"` 与既有 `--us-*` token 受控映射。
不引入 `@ant-design/icons` 或其他依赖，继续使用现有图标系统。

## 适用范围与非目标

当前仅在 `/us/preview` 进行技术验证，验证受控 Tree、Modal、Form 等 adapter。
不替换现有生产 Grid、Canvas、Doc、Matrix、BI、ANA；不实现数据目录树业务，
也不改变统一数据源事实模型。

## 性能约束

技术预览及其 Provider 不得进入非预览 UniSource 路由的初始加载包。
生产迁移须以页面或能力边界按需加载，不能因组件库验证增加首页、数据源或表达页面的同步依赖。

## 风险、替代方案与回退

风险是视觉 token 与 Ant Design CSS 变量、浮层容器之间可能发生冲突。
优先使用 Provider token；确需桥接时仅在 Provider 根节点限定样式，避免全局 `.ant-*` 覆盖。
保留全部既有自定义组件。删除 adapter 与 preview 即可回退，本决策不迁移或持久化业务数据。

## 关联

- ADR-002：前端框架与视图层
- AG-100：跨包依赖边界
- AG-101：Web 不得导入后端内部模块
- AG-502：依赖须经 ADR 与 allowlist 批准
