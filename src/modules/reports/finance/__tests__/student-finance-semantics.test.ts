import { describe, it, expect } from "vitest";
import {
  OPEN_INVOICE_STATUSES,
  resolveOverdueBoundary,
  resolveInvoiceTimezone,
  buildOutstandingInvoiceWhere,
  buildOverdueInvoiceWhere,
} from "@/modules/reports/finance/student-finance-semantics";

// =============================================================================
// F-M1 — the canonical overdue/outstanding specification. Overdue is a financial
// FACT (open + balance > 0 + dueDate < boundary), not the materialized status.
// =============================================================================

describe("OPEN_INVOICE_STATUSES", () => {
  it("is the three claim-bearing statuses (PAID / CANCELLED excluded)", () => {
    expect([...OPEN_INVOICE_STATUSES]).toEqual(["PENDING", "PARTIALLY_PAID", "OVERDUE"]);
    expect(OPEN_INVOICE_STATUSES).not.toContain("PAID");
    expect(OPEN_INVOICE_STATUSES).not.toContain("CANCELLED");
  });
});

describe("buildOutstandingInvoiceWhere", () => {
  it("requires an open status AND a positive balance, org/student scoped, non-deleted", () => {
    expect(buildOutstandingInvoiceWhere({ organizationId: "o1", studentId: "s1" })).toEqual({
      organizationId: "o1",
      studentId: "s1",
      deletedAt: null,
      status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      balanceAmount: { gt: 0 },
    });
  });
});

describe("buildOverdueInvoiceWhere", () => {
  it("is the outstanding set AND past the boundary (dueDate < boundary)", () => {
    const boundary = new Date("2026-07-21T00:00:00Z");
    expect(buildOverdueInvoiceWhere({ organizationId: "o1", studentId: "s1", boundary })).toEqual({
      organizationId: "o1",
      studentId: "s1",
      deletedAt: null,
      status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      balanceAmount: { gt: 0 },
      dueDate: { lt: boundary },
    });
  });
});

describe("resolveOverdueBoundary", () => {
  const NOW = new Date("2026-07-21T09:00:00Z"); // mid-morning UTC

  it("with graceDays 0 (UTC) is the start of today — due TODAY is not yet overdue, due YESTERDAY is", () => {
    const boundary = resolveOverdueBoundary({ timezone: "UTC", graceDays: 0, now: NOW });
    expect(boundary.toISOString()).toBe("2026-07-21T00:00:00.000Z");

    const dueToday = new Date("2026-07-21T00:00:00Z");
    const dueEarlierToday = new Date("2026-07-21T08:00:00Z");
    const dueYesterday = new Date("2026-07-20T23:59:00Z");
    expect(dueToday.getTime() < boundary.getTime()).toBe(false); // not overdue
    expect(dueEarlierToday.getTime() < boundary.getTime()).toBe(false); // not overdue
    expect(dueYesterday.getTime() < boundary.getTime()).toBe(true); // overdue
  });

  it("subtracts grace days from the boundary", () => {
    const b0 = resolveOverdueBoundary({ timezone: "UTC", graceDays: 0, now: NOW });
    const b5 = resolveOverdueBoundary({ timezone: "UTC", graceDays: 5, now: NOW });
    expect(b0.getTime() - b5.getTime()).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it("falls back safely and never throws on an invalid timezone", () => {
    expect(() => resolveOverdueBoundary({ timezone: "Not/AZone", graceDays: 0, now: NOW })).not.toThrow();
  });
});

describe("resolveInvoiceTimezone", () => {
  it("passes valid IANA zones through, falls back to UTC with a warning otherwise", () => {
    expect(resolveInvoiceTimezone("Africa/Maputo")).toEqual({ timezone: "Africa/Maputo" });
    expect(resolveInvoiceTimezone(null)).toEqual({ timezone: "UTC" });
    const bad = resolveInvoiceTimezone("Not/AZone");
    expect(bad.timezone).toBe("UTC");
    expect(bad.warning).toBeDefined();
  });
});
