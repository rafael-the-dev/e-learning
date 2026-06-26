import { describe, it, expect } from "vitest";
import { resolveTeacherPortalBlockedReason } from "../services/teacher-portal.service";

describe("resolveTeacherPortalBlockedReason", () => {
  it("returns NOT_LINKED when there is no Teacher record linked to the current user", () => {
    expect(resolveTeacherPortalBlockedReason(null)).toBe("NOT_LINKED");
  });

  it("returns INACTIVE when the linked Teacher is SUSPENDED", () => {
    expect(resolveTeacherPortalBlockedReason({ status: "SUSPENDED" })).toBe("INACTIVE");
  });

  it("returns INACTIVE when the linked Teacher is INACTIVE", () => {
    expect(resolveTeacherPortalBlockedReason({ status: "INACTIVE" })).toBe("INACTIVE");
  });

  it("returns null (not blocked) when the linked Teacher is ACTIVE", () => {
    expect(resolveTeacherPortalBlockedReason({ status: "ACTIVE" })).toBeNull();
  });
});
