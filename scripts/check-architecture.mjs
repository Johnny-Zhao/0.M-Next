import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const packagesRoot = path.join(root, "packages");
const rules = JSON.parse(
  fs.readFileSync(path.join(root, "architecture", "dependencies.json"), "utf8"),
);
const packageNames = new Set(Object.keys(rules));

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function importedPackages(source) {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:[^"'`]*?\s+from\s+)?["'`]([^"'`]+)["'`]/g,
    /\brequire\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

function targetFromSpecifier(owner, file, specifier) {
  const alias = specifier.match(/^@m-next\/([^/]+)(?:\/.*)?$/);
  if (alias)
    return {
      target: alias[1],
      publicEntry: specifier === `@m-next/${alias[1]}`,
    };

  if (specifier.startsWith(".")) {
    const resolved = path.resolve(path.dirname(file), specifier);
    const relative = path.relative(packagesRoot, resolved).split(path.sep);
    if (
      relative.length > 1 &&
      packageNames.has(relative[0]) &&
      relative[0] !== owner
    ) {
      return { target: relative[0], publicEntry: false };
    }
  }
  return null;
}

function normalized(file) {
  return file.split(path.sep).join("/");
}

function addSourceViolations(violations, owner, file, source) {
  const relative = normalized(path.relative(root, file));
  const packageRelative = normalized(
    path.relative(path.join(packagesRoot, owner), file),
  );
  const isTest =
    packageRelative.includes("/test/") || /\.test\.[cm]?[jt]sx?$/.test(file);

  if (
    owner === "shared" &&
    /\b(?:java\.io|java\.nio\.file|node:fs|node:net|node:http|fetch\s*\()/.test(
      source,
    )
  ) {
    violations.push(`${relative}: AG-100 shared must not perform I/O`);
  }

  if (
    ["views", "web"].includes(owner) &&
    /\b(?:localStorage|indexedDB)\b/.test(source)
  ) {
    const storageKeys = [...source.matchAll(/["'`]([^"'`]+)["'`]/g)].map(
      (match) => match[1],
    );
    if (!storageKeys.some((key) => key.startsWith("ui."))) {
      violations.push(
        `${relative}: AG-102 persisted view preferences must use a ui. key`,
      );
    }
  }

  if (
    owner === "kernel" &&
    /\b(?:org\.apache\.poi|java\.net\.http|okhttp|anthropic|openai|step|reqif|xmi)\b/i.test(
      source,
    )
  ) {
    violations.push(
      `${relative}: AG-103 kernel contains a forbidden heavy or outbound dependency`,
    );
  }

  if (
    owner !== "kernel" &&
    /\bimport\s+com\.mnext\.kernel\.(?!api(?:\.|;))/.test(source)
  ) {
    violations.push(
      `${relative}: AG-104 non-kernel code may only import kernel/api`,
    );
  }

  if (
    owner === "engines" &&
    packageRelative.includes("/rules/") &&
    /com\.mnext\.kernel\.api\.commands/.test(source)
  ) {
    violations.push(`${relative}: AG-105 rules must not import write commands`);
  }

  if (owner === "engines" && packageRelative.includes("/ai/")) {
    for (const match of source.matchAll(
      /com\.mnext\.kernel\.api\.commands\.([A-Za-z0-9_]+)/g,
    )) {
      if (!["SubmitAIChangeSet", "ConfirmAIChangeSet"].includes(match[1])) {
        violations.push(`${relative}: AG-106 AI may not import ${match[1]}`);
      }
    }
  }

  if (owner === "server" && /com\.mnext\.engines\.sim/.test(source)) {
    violations.push(
      `${relative}: AG-107 server must not assemble simulation code`,
    );
  }

  if (
    /com\.mnext\.engines\.exchange\.adapters/.test(source) &&
    (owner === "kernel" ||
      (owner === "server" && /\/(?:readmodel|upload)\//.test(packageRelative)))
  ) {
    violations.push(
      `${relative}: AG-108 deep artifact adapters may only run in workers`,
    );
  }

  if (
    owner === "engines" &&
    packageRelative.includes("/template/") &&
    /\b(?:implements\s+TaskHandler|TaskHandler\s*[<{])/.test(source)
  ) {
    violations.push(
      `${relative}: AG-109 templates must not register TaskHandler`,
    );
  }

  if (
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:object|field_value|relation)\b/i.test(
      source,
    ) &&
    !(owner === "kernel" && packageRelative.includes("/internal/persistence/"))
  ) {
    violations.push(
      `${relative}: AG-110 main-data SQL writes belong in kernel/internal/persistence`,
    );
  }

  if (
    isTest &&
    /\b(?:Thread\.sleep|setTimeout\s*\()/.test(source) &&
    !source.includes("AG-504-exempt:")
  ) {
    violations.push(`${relative}: AG-504 tests must not sleep while waiting`);
  }

  if (/https?:\/\/(?!localhost|127\.0\.0\.1)/.test(source)) {
    violations.push(
      `${relative}: AG-505 source code must not hard-code public URLs`,
    );
  }

  if (/\.[cm]?[jt]sx?$/.test(file)) {
    const name = path.basename(file);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.test)?\.[cm]?[jt]sx?$/.test(name)) {
      violations.push(
        `${relative}: AG-302 TypeScript source filenames must use kebab-case`,
      );
    }
  }
}

function scan(base = packagesRoot) {
  const violations = [];
  for (const owner of packageNames) {
    const sourceRoot = path.join(base, owner, "src");
    const files = walk(sourceRoot).filter((file) =>
      /\.(java|[cm]?[jt]sx?)$/.test(file),
    );
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      addSourceViolations(violations, owner, file, source);

      for (const match of source.matchAll(
        /\bimport\s+com\.mnext\.([a-zA-Z0-9_]+)\b/g,
      )) {
        const target = match[1];
        if (
          packageNames.has(target) &&
          target !== owner &&
          !rules[owner].includes(target)
        ) {
          violations.push(
            `${path.relative(root, file)}: ${owner} may not import ${target}`,
          );
        }
      }

      for (const specifier of importedPackages(source)) {
        const dependency = targetFromSpecifier(owner, file, specifier);
        if (dependency === null || dependency.target === owner) continue;
        if (
          !packageNames.has(dependency.target) ||
          !rules[owner].includes(dependency.target)
        ) {
          violations.push(
            `${path.relative(root, file)}: ${owner} may not import ${dependency.target}`,
          );
        } else if (!dependency.publicEntry) {
          violations.push(
            `${path.relative(root, file)}: cross-package imports must use the public entry point`,
          );
        }
      }
    }
  }
  return violations;
}

function selfTest() {
  const fixture = fs.mkdtempSync(
    path.join(os.tmpdir(), "m-next-architecture-"),
  );
  try {
    const fixtures = {
      "kernel/src/illegal.ts": 'import "@m-next/server";\n',
      "engines/src/main/java/com/mnext/engines/illegal.java":
        "import com.mnext.kernel.internal.Repository;\n",
      "views/src/bad-name.ts": 'localStorage.setItem("workspace", "copy");\n',
      "engines/src/rules/illegal.ts":
        'import "com.mnext.kernel.api.commands.CreateObject";\n',
      "engines/src/template/illegal.ts":
        "class Illegal implements TaskHandler {}\n",
      "web/src/sleep.test.ts": "setTimeout(() => {}, 1000);\n",
    };
    for (const [name, content] of Object.entries(fixtures)) {
      const target = path.join(fixture, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    }
    const violations = scan(fixture);
    const expected = [
      "kernel may not import server",
      "AG-104",
      "AG-102",
      "AG-105",
      "AG-109",
      "AG-504",
    ];
    if (
      !expected.every((rule) =>
        violations.some((violation) => violation.includes(rule)),
      )
    ) {
      throw new Error(
        `negative test was not rejected: ${violations.join(", ")}`,
      );
    }
    console.log(
      "Architecture negative test passed: illegal import was rejected.",
    );
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

if (process.argv.includes("--self-test")) {
  selfTest();
} else {
  const violations = scan();
  if (violations.length > 0) {
    console.error("Architecture dependency violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log("Architecture dependency check passed.");
  }
}
