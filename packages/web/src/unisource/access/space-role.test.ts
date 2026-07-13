import { describe, expect, it } from "vitest";

import type { PermissionMatrix } from "../model/kernel";
import { cloneDemoSeed } from "../seed/demo-seed";
import { projectSpaceRole } from "./space-role";

describe("projectSpaceRole", () => {
  it("projects the demo members into space roles", () => {
    const permissions = cloneDemoSeed().permissions;

    expect(projectSpaceRole("wangyun", permissions)).toBe("ADMIN");
    expect(projectSpaceRole("lixiao", permissions)).toBe("AUTHOR");
    expect(projectSpaceRole("chenmo", permissions)).toBe("AUTHOR");
    expect(projectSpaceRole("zhouran", permissions)).toBe("VIEWER");
  });

  it("uses the strongest permission level across resources", () => {
    const permissions: PermissionMatrix = {
      wangyun: { data: "readonly", view: "admin" },
      lixiao: { data: "none", view: "owner" },
      chenmo: { data: "readonly", view: "edit" },
      zhouran: { data: "readonly", view: "none" },
      ai: {},
    };

    expect(projectSpaceRole("wangyun", permissions)).toBe("ADMIN");
    expect(projectSpaceRole("lixiao", permissions)).toBe("AUTHOR");
    expect(projectSpaceRole("chenmo", permissions)).toBe("AUTHOR");
    expect(projectSpaceRole("zhouran", permissions)).toBe("VIEWER");
    expect(projectSpaceRole("ai", permissions)).toBe("VIEWER");
  });
});
