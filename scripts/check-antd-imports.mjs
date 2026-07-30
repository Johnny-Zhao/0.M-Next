import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "packages", "web", "src", "unisource");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function allowed(relative) {
  return relative.startsWith("ui/");
}

function tokenize(source) {
  const tokens = [];
  for (let index = 0; index < source.length; ) {
    const current = source[index];
    const next = source[index + 1];
    if (/\s/.test(current)) index += 1;
    else if (current === "/" && next === "/") {
      index = source.indexOf("\n", index + 2);
      if (index < 0) break;
    } else if (current === "/" && next === "*") {
      index = source.indexOf("*/", index + 2);
      if (index < 0) break;
      index += 2;
    } else if (current === "'" || current === '"') {
      const quote = current;
      let value = "";
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") index += 1;
        value += source[index] ?? "";
        index += 1;
      }
      tokens.push({ kind: "string", value });
      index += 1;
    } else if (current === "`") {
      index = source.indexOf("`", index + 1) + 1;
      if (index === 0) break;
    } else if (/[A-Za-z_$]/.test(current)) {
      let value = current;
      index += 1;
      while (index < source.length && /[\w$]/.test(source[index])) {
        value += source[index];
        index += 1;
      }
      tokens.push({ kind: "word", value });
    } else {
      tokens.push({ kind: "punctuation", value: current });
      index += 1;
    }
  }
  return tokens;
}

function violation(relative, specifier) {
  if (!specifier.startsWith("antd")) return null;
  if (allowed(relative) && specifier === "antd") return null;
  return `packages/web/src/unisource/${relative}: ${specifier === "antd" ? "Ant Design imports are allowed only in ui/**" : "Ant Design deep imports are prohibited; use the root antd package only in ui/**"}`;
}

export function scanAntdImports(relative, source) {
  const violations = [];
  const add = (specifier) => {
    const result = violation(relative, specifier);
    if (result) violations.push(result);
  };
  const tokens = tokenize(source);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token?.value === "import") {
      const next = tokens[index + 1];
      if (next?.kind === "string") add(next.value);
      else if (next?.value === "(" && tokens[index + 2]?.kind === "string") {
        add(tokens[index + 2].value);
      } else {
        for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
          if (tokens[cursor]?.value === ";") break;
          if (
            tokens[cursor]?.value === "from" &&
            tokens[cursor + 1]?.kind === "string"
          ) {
            add(tokens[cursor + 1].value);
            break;
          }
        }
      }
    } else if (
      token?.value === "require" &&
      tokens[index + 1]?.value === "(" &&
      tokens[index + 2]?.kind === "string"
    ) {
      add(tokens[index + 2].value);
    }
  }
  return violations;
}

function run() {
  const violations = walk(sourceRoot)
    .filter(
      (file) => /\.(?:ts|tsx)$/.test(file) && !/\.test\.(?:ts|tsx)$/.test(file),
    )
    .flatMap((file) =>
      scanAntdImports(
        path.relative(sourceRoot, file).split(path.sep).join("/"),
        fs.readFileSync(file, "utf8"),
      ),
    );
  if (violations.length) {
    violations.forEach((violation) => console.error(violation));
    process.exitCode = 1;
  } else console.log("Ant Design import boundary check passed.");
}

function selfTest() {
  const pass = scanAntdImports(
    "ui/example.tsx",
    'import { Tree } from "antd";',
  );
  const failures = [
    scanAntdImports("grid/example.tsx", 'import { Tree } from "antd";'),
    scanAntdImports("grid/example.tsx", 'import("antd");'),
    scanAntdImports("grid/example.ts", 'require("antd");'),
    scanAntdImports("ui/example.tsx", 'import { Tree } from "antd/es/tree";'),
  ];
  const ignored = scanAntdImports(
    "grid/example.ts",
    '// import("antd")\nconst label = "antd";',
  );
  if (
    pass.length ||
    ignored.length ||
    failures.some(
      (result) =>
        result.length !== 1 ||
        !result[0].includes("packages/web/src/unisource/"),
    )
  )
    process.exitCode = 1;
  else console.log("Ant Design import boundary self-test passed.");
}

if (process.argv.includes("--self-test")) selfTest();
else run();
