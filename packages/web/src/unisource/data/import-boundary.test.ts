import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface ImportStatement {
  readonly statement: string;
  readonly specifier: string;
}

const unisourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const allowedViewsImports = new Set([
  "data/kernel-gateway.ts",
  "data/dto-mappers.ts",
  "doc/structured-document-view.tsx",
]);

describe("unisource import boundary", () => {
  it("keeps @m-next/views imports in the approved unisource whitelist", () => {
    const offenders = sourceFiles(unisourceRoot).flatMap((file) => {
      const relative = toRelative(file);
      if (relative === "data/import-boundary.test.ts") return [];
      return importStatements(file)
        .filter(({ specifier }) => specifier === "@m-next/views")
        .filter(({ statement }) => {
          if (!allowedViewsImports.has(relative)) return true;
          if (
            relative === "data/kernel-gateway.ts" ||
            relative === "doc/structured-document-view.tsx"
          )
            return false;
          return !statement.trimStart().startsWith("import type");
        })
        .map(({ statement }) => `${relative}: ${statement.trim()}`);
    });

    expect(offenders).toEqual([]);
  });

  it("does not import workbench internals from unisource", () => {
    const offenders = sourceFiles(unisourceRoot).flatMap((file) => {
      const relative = toRelative(file);
      if (relative === "data/import-boundary.test.ts") return [];
      return importStatements(file)
        .filter(({ specifier }) => importsWorkbench(specifier))
        .map(({ statement }) => `${relative}: ${statement.trim()}`);
    });

    expect(offenders).toEqual([]);
  });
});

function sourceFiles(root: string): readonly string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return isSourceFile(entry.name) ? [fullPath] : [];
  });
}

function importStatements(file: string): readonly ImportStatement[] {
  const source = fs.readFileSync(file, "utf8");
  return [
    ...matches(
      source,
      /\bimport\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["']/g,
    ),
    ...matches(source, /\bimport\s+["']([^"']+)["']/g),
    ...matches(source, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
  ];
}

function matches(source: string, pattern: RegExp): readonly ImportStatement[] {
  return [...source.matchAll(pattern)].map((match) => ({
    statement: match[0] ?? "",
    specifier: match[1] ?? "",
  }));
}

function importsWorkbench(specifier: string): boolean {
  return (
    specifier.includes("packages/web/src/workbench") ||
    /(^|\/|\\)workbench(\/|\\|$)/.test(specifier)
  );
}

function isSourceFile(name: string): boolean {
  return (
    (name.endsWith(".ts") || name.endsWith(".tsx")) && !name.endsWith(".d.ts")
  );
}

function toRelative(file: string): string {
  return path.relative(unisourceRoot, file).split(path.sep).join("/");
}
