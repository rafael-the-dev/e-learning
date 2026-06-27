import { describe, it, expect } from "vitest";
import { resolveStudentPortalBlockedReason } from "../services/student-portal.service";

describe("resolveStudentPortalBlockedReason", () => {
  it("returns NOT_LINKED when there is no Student record linked to the current user", () => {
    expect(resolveStudentPortalBlockedReason(null)).toBe("NOT_LINKED");
  });

  it("returns INACTIVE when the linked Student is PENDING (not yet activated)", () => {
    expect(resolveStudentPortalBlockedReason({ status: "PENDING" })).toBe("INACTIVE");
  });

  it("returns INACTIVE when the linked Student is SUSPENDED", () => {
    expect(resolveStudentPortalBlockedReason({ status: "SUSPENDED" })).toBe("INACTIVE");
  });

  it("returns INACTIVE when the linked Student is DROPPED", () => {
    expect(resolveStudentPortalBlockedReason({ status: "DROPPED" })).toBe("INACTIVE");
  });

  it("returns null (not blocked) when the linked Student is ACTIVE", () => {
    expect(resolveStudentPortalBlockedReason({ status: "ACTIVE" })).toBeNull();
  });
});
