import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const readSource = (...parts: string[]) =>
  fs.readFileSync(
    path.resolve(process.cwd(), "src", "unisource", ...parts),
    "utf8",
  );

describe("Ant Design preview route boundary", () => {
  it("keeps the preview page lazy while the provider scopes the UniSource app", () => {
    const app = readSource("app.tsx");
    expect(app).toContain('lazy(() => import("./ui/preview-route"))');
    expect(app).not.toContain('from "./pages/preview-page"');
    expect(app).toContain('from "./ui/uni-source-ui-provider"');
    expect(app).not.toContain('"./ui/ant-bridge.css"');
    expect(app).not.toContain('from "antd"');
  });

  it("keeps preview-only controls inside the lazy route", () => {
    const route = readSource("ui", "preview-route.tsx");
    expect(route).toContain('import "./ant-bridge.css"');
    expect(route).toContain("<AntDesignPreviewLab />");
  });

  it("keeps preview drag state local and forwards a controlled drop intent", () => {
    const tree = readSource("ui", "experimental-us-tree.tsx");
    const preview = readSource("ui", "ant-design-preview-lab.tsx");
    expect(tree).toContain("onDropIntent");
    expect(preview).toContain("reorderExperimentalDirectorySiblings");
    expect(preview).not.toMatch(/WorkspaceStore|Gateway/);
  });
});
