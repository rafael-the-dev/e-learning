import { describe, it, expect } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../permissions";

// ---------------------------------------------------------------------------
// 15. Permission enforced
// ---------------------------------------------------------------------------

describe("FINANCIAL_REPORTS_CLOSING_VIEW — permission enforced (test 15)", () => {
  it("is registered in the permission catalog", () => {
    expect(PERMISSIONS.FINANCIAL_REPORTS_CLOSING_VIEW).toBe("financialReports.closing.view");
  });

  it("is granted to SUPER_ADMIN and ORG_ADMIN by default", () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(PERMISSIONS.FINANCIAL_REPORTS_CLOSING_VIEW);
    expect(ROLE_PERMISSIONS.ORG_ADMIN).toContain(PERMISSIONS.FINANCIAL_REPORTS_CLOSING_VIEW);
  });

  it("is NOT granted to SECRETARY, TEACHER, or STUDENT by default", () => {
    expect(ROLE_PERMISSIONS.SECRETARY).not.toContain(PERMISSIONS.FINANCIAL_REPORTS_CLOSING_VIEW);
    expect(ROLE_PERMISSIONS.TEACHER).not.toContain(PERMISSIONS.FINANCIAL_REPORTS_CLOSING_VIEW);
    expect(ROLE_PERMISSIONS.STUDENT).not.toContain(PERMISSIONS.FINANCIAL_REPORTS_CLOSING_VIEW);
  });
});
