/**
 * 同源 UniSource Token 门禁:
 * packages/web/src/unisource/ 内,除 us-tokens.css 外禁止出现
 *   1) 颜色字面量(#hex / rgb() / rgba() / hsl() / hsla() / oklch())
 *   2) 裸 font-family 字体名字面量(IBM Plex / Noto Sans|Serif / Source Serif)
 * 依据:交接规格 §09 DEV NOTES「实现时一律映射为 Token,不复制像素值散写」。
 * 用法:node scripts/check-us-tokens.mjs [--self-test]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const targetDir = path.join(root, "packages", "web", "src", "unisource");
const allowedFile = path.join(targetDir, "us-tokens.css");

const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|(?:\brgba?|\bhsla?|\boklch)\s*\(/g;
const FONT_PATTERN =
  /font-family\s*:(?!\s*var\()|IBM Plex|Noto (?:Sans|Serif)|Source Serif/g;

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

export function scanSource(relativeFile, source) {
  const violations = [];
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // 注释行允许提及(设计出处说明)
    const isComment =
      trimmed.startsWith("*") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*");
    if (isComment) return;
    for (const pattern of [COLOR_PATTERN, FONT_PATTERN]) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match !== null) {
        violations.push(
          `${relativeFile}:${index + 1} 发现「${match[0]}」— 请改用 us-tokens.css 的 var(--us-*)`,
        );
      }
    }
  });
  return violations;
}

function run() {
  const files = walk(targetDir).filter(
    (file) =>
      /\.(?:ts|tsx|css)$/.test(file) &&
      path.resolve(file) !== path.resolve(allowedFile),
  );
  const violations = files.flatMap((file) =>
    scanSource(
      path.relative(root, file).split(path.sep).join("/"),
      fs.readFileSync(file, "utf8"),
    ),
  );
  if (violations.length > 0) {
    console.error(`us-tokens 门禁失败(${violations.length} 处):`);
    for (const violation of violations) console.error("  " + violation);
    process.exit(1);
  }
  console.log(`us-tokens 门禁通过(扫描 ${files.length} 个文件)。`);
}

function selfTest() {
  const bad = scanSource("x.tsx", 'const c = "#1C1B18";');
  const badFont = scanSource("x.css", "a{font-family:'IBM Plex Sans'}");
  const good = scanSource(
    "y.tsx",
    ['const c = "var(--us-primary)";', "// #0E6E5C 注释行允许"].join("\n"),
  );
  const goodFont = scanSource("y.css", "a{font-family: var(--us-font-ui)}");
  const ok =
    bad.length === 1 &&
    badFont.length === 1 &&
    good.length === 0 &&
    goodFont.length === 0;
  console.log(ok ? "self-test 通过" : "self-test 失败");
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();
else run();
