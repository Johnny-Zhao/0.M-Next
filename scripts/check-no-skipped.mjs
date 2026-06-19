#!/usr/bin/env node
// 门禁守卫:扫描 Maven surefire 报告,若有"跳过"的测试或根本没有报告就失败。
// 目的:拦截"假绿"——集成测试因 Docker 缺失/环境问题被静默跳过,但 BUILD SUCCESS。
// 用法:在 `pnpm verify`(测试阶段已跑完)之后执行 `node scripts/check-no-skipped.mjs`。
// 平台无关(CI 与本地通用)。

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function surefireReports(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // 跳过依赖目录,加速
      if (e.name === "node_modules" || e.name === ".git") continue;
      out.push(...surefireReports(full));
    } else if (
      e.isFile() &&
      e.name.startsWith("TEST-") &&
      e.name.endsWith(".xml") &&
      full.replaceAll("\\", "/").includes("/target/surefire-reports/")
    ) {
      out.push(full);
    }
  }
  return out;
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="(\\d+)"`));
  return m ? Number(m[1]) : 0;
}

const files = surefireReports(root);

if (files.length === 0) {
  console.error(
    "❌ 未找到任何 surefire 报告(target/surefire-reports/TEST-*.xml)——测试根本没跑?",
  );
  process.exit(1);
}

let totalTests = 0;
let totalSkipped = 0;
const offenders = [];

for (const f of files) {
  const xml = readFileSync(f, "utf8");
  const m = xml.match(/<testsuite\b[^>]*>/);
  if (!m) continue;
  const tests = attr(m[0], "tests");
  const skipped = attr(m[0], "skipped");
  totalTests += tests;
  totalSkipped += skipped;
  if (skipped > 0)
    offenders.push(`  ${f.replace(root, ".")}: skipped=${skipped}/${tests}`);
}

if (totalSkipped > 0) {
  console.error(
    `❌ 检测到跳过的测试(Skipped:${totalSkipped})——集成测试可能因 Docker 缺失/环境问题被静默跳过,这是"假绿":`,
  );
  offenders.forEach((o) => console.error(o));
  console.error(
    "修复:确认 Docker 可用(testcontainers 能起容器)后重跑;不得带跳过合并。",
  );
  process.exit(1);
}

console.log(
  `✅ Skipped:0 守卫通过 —— ${files.length} 个 surefire 套件、共 ${totalTests} 个测试全部执行,无跳过。`,
);
