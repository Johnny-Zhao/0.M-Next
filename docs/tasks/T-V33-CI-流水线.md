# T-V33-CI — CI 流水线 + Skipped:0 守卫(GitLab CI)

目的:把 AG-404 门禁搬上 CI,**强制 Skipped:0**,根治本项目反复出现的"假绿"(集成测试因 Docker 缺失/环境争用被静默跳过却 BUILD SUCCESS)。独立、不碰业务代码/契约,与 energy/fUML/Modelica 零冲突。

## 范围

- **Skipped:0 守卫**(`scripts/check-no-skipped.mjs`,已起草+本地自测通过):扫 `packages/*/target/surefire-reports/TEST-*.xml`,任一套件 `skipped>0` 或根本没报告 → 退出码 1。`pnpm verify` 后执行。
- **GitLab 流水线**(`.gitlab-ci.yml`,已起草):单 `verify` stage:`corepack pnpm install --frozen-lockfile` → `corepack pnpm verify`(AG-404 全门禁,含 jacoco≥0.80)→ `node scripts/check-no-skipped.mjs`。干净 checkout 天然满足 check-contracts(AG-406)。
- 可选:把守卫挂进 `package.json` 的 `verify` 末尾或新增 `verify:ci`,使本地也能一键带守卫(本卡只加 CI 调用,不强改 verify 定义,避免影响现有流程)。

## 封闭文件清单

**新增**
- `scripts/check-no-skipped.mjs`(守卫,已起草)
- `.gitlab-ci.yml`(流水线,已起草)

**零碰**:packages/**(业务代码)、contracts、迁移、AGENTS.md(如要把"CI 必跑守卫"写进 AG-404 描述,另起人发起的 spec 改动)。

## 待 runner 适配(本卡实现时落实,需你的 GitLab 环境)

1. **镜像**:`image:` 改成内网私服的 JDK21+Node 镜像(AG-502 断网构建);
2. **runner tag**:改成能跑 DinD 的 tag;
3. **testcontainers + DinD 网络**:这是**成败关键**——必须确认 CI 里集成测试**真起容器、真跑**(否则又是 Skipped,守卫会拦下但 CI 红)。常见要点:`DOCKER_HOST` 指向 dind service、Ryuk 放宽(`TESTCONTAINERS_RYUK_DISABLED`)、必要时 `TESTCONTAINERS_HOST_OVERRIDE`;
4. **依赖私服**:Maven settings.xml / .npmrc 指向内网私服,保证断网可解析。

## 验收

- 流水线在你的 GitLab 跑通:`verify` 绿 + 守卫 `✅ Skipped:0`;
- **反向验证**(关键):故意让一个集成测试跳过(或停 Docker)→ 守卫 `❌` 退出 1 → 流水线红。证明它真能拦假绿。
- jacoco≥0.80 门禁生效;junit 报告 + 覆盖率 artifacts 留存。

## 跟进(本卡不做,登记)
双架构镜像构建、性能基准回退门禁(AG-404 余项);把"CI 必过 + Skipped:0 守卫"固化进 AGENTS.md(人发起 spec 改动)。

## 备注
`scripts/check-no-skipped.mjs` 已本地自测:对 E:\0.M-Next 现有报告跑出"60 套件/242 测试/Skipped:0,exit 0";逻辑确认可用。`.gitlab-ci.yml` 含占位,需按上面 §"待 runner 适配"改实。
