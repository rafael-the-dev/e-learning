import { describe, it, expect } from "vitest";
import { diffPermissions, getModuleLabel, getActionLabel } from "../permission-matrix.service";

describe("diffPermissions", () => {
  it("returns empty added/removed when nothing changed", () => {
    expect(diffPermissions(["a", "b"], ["a", "b"])).toEqual({ added: [], removed: [] });
  });

  it("detects added and removed permission ids", () => {
    expect(diffPermissions(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
  });

  it("handles an empty before set (role created with no permissions)", () => {
    expect(diffPermissions([], ["a"])).toEqual({ added: ["a"], removed: [] });
  });

  it("handles an empty after set (all permissions revoked)", () => {
    expect(diffPermissions(["a"], [])).toEqual({ added: [], removed: ["a"] });
  });
});

describe("getModuleLabel", () => {
  it("returns the curated PT label for a known module", () => {
    expect(getModuleLabel("students")).toBe("Alunos");
    expect(getModuleLabel("billingPolicies")).toBe("Políticas de Faturação");
  });

  it("falls back to a humanized label for an unknown module", () => {
    expect(getModuleLabel("someFutureModule")).toBe("Some future module");
  });
});

describe("getActionLabel", () => {
  it("returns the curated PT label for a known action", () => {
    expect(getActionLabel("view")).toBe("Ver");
    expect(getActionLabel("managePermissions")).toBe("Gerir Permissões");
  });

  it("falls back to a humanized label for an unknown action", () => {
    expect(getActionLabel("someFutureAction")).toBe("Some future action");
  });
});
