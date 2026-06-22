import { describe, it, expect } from "vitest";
import { parsePermissionCode, buildPermissionCode } from "../permission-codec";
import { PERMISSIONS } from "../permissions";

describe("permission-codec", () => {
  it("round-trips a simple two-segment code", () => {
    const parsed = parsePermissionCode("organizations.create");
    expect(parsed).toEqual({ module: "organizations", action: "create" });
    expect(buildPermissionCode(parsed.module, parsed.action)).toBe("organizations.create");
  });

  it("preserves multi-dot codes exactly instead of truncating them", () => {
    for (const code of [
      "integrity.issues.view",
      "integrity.issues.resolve",
      "prerequisites.waivers.manage",
    ]) {
      const { module, action } = parsePermissionCode(code);
      expect(buildPermissionCode(module, action)).toBe(code);
    }
  });

  it("does not collide integrity.issues.view and integrity.issues.resolve", () => {
    const view = parsePermissionCode("integrity.issues.view");
    const resolve = parsePermissionCode("integrity.issues.resolve");
    expect(view).not.toEqual(resolve);
    expect(buildPermissionCode(view.module, view.action)).not.toBe(
      buildPermissionCode(resolve.module, resolve.action)
    );
  });

  it("derives module as the first segment and action as the remainder", () => {
    expect(parsePermissionCode("financialReports.studentStatement.view")).toEqual({
      module: "financialReports",
      action: "studentStatement.view",
    });
  });

  it("throws on a code with no module separator", () => {
    expect(() => parsePermissionCode("noSeparator")).toThrow();
  });

  it("round-trips every permission constant in the catalog with no collisions", () => {
    const codes = Object.values(PERMISSIONS) as string[];
    const reconstructed = new Set<string>();

    for (const code of codes) {
      const { module, action } = parsePermissionCode(code);
      const rebuilt = buildPermissionCode(module, action);
      expect(rebuilt).toBe(code);
      reconstructed.add(rebuilt);
    }

    // Every constant must produce a unique (module, action) pair — no two
    // distinct permission codes are allowed to collide once parsed.
    expect(reconstructed.size).toBe(codes.length);
  });
});
