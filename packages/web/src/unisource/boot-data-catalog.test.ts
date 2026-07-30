import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("data catalog boot boundary", () => {
  it("leaves catalog loading to the future data-source surface", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src", "unisource", "boot.tsx"),
      "utf8",
    );

    expect(source).not.toContain('from "./state/data-catalog-store"');
    expect(source).not.toContain("dataCatalogStore.load");
  });
});
