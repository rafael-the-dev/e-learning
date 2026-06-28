import { describe, it, expect } from "vitest";
import {
  buildSecretaryKpis,
  computeUrgentTasks,
  buildSecretaryTodayOverview,
  type SecretaryKpiInputs,
} from "../services/secretary-portal-kpis.service";
import {
  resolveSecretaryQuickActions,
  SECRETARY_QUICK_ACTION_CANDIDATES,
  KNOWN_SECRETARY_ROUTES,
} from "../services/secretary-portal.service";
import { mergeAndSortDeadlines } from "../services/secretary-portal-deadlines.service";
import type { SecretaryDeadline } from "../types";

const BASE_INPUT: SecretaryKpiInputs = {
  pendingEnrollments: 4,
  activeStudents: 120,
  pendingPayments: 3,
  overdueInvoices: 5,
  documentsToReview: 2,
  unreadNotifications: 7,
  formingClassGroups: 1,
};

describe("buildSecretaryKpis", () => {
  it("(6-11) maps every aggregated count onto the corresponding KPI field", () => {
    const kpis = buildSecretaryKpis(BASE_INPUT);
    expect(kpis).toMatchObject({
      pendingEnrollments: 4,
      activeStudents: 120,
      pendingPayments: 3,
      overdueInvoices: 5,
      documentsToReview: 2,
      unreadNotifications: 7,
      formingClassGroups: 1,
    });
  });
});

describe("computeUrgentTasks", () => {
  it("(11) sums overdue invoices + pending enrollments + pending payments + documents to review", () => {
    // 5 + 4 + 3 + 2 = 14 (unread notifications and active students are NOT urgent work)
    expect(computeUrgentTasks(BASE_INPUT)).toBe(14);
  });

  it("is zero when there is no actionable backlog", () => {
    expect(
      computeUrgentTasks({
        pendingEnrollments: 0,
        activeStudents: 999,
        pendingPayments: 0,
        overdueInvoices: 0,
        documentsToReview: 0,
        unreadNotifications: 99,
        formingClassGroups: 9,
      })
    ).toBe(0);
  });
});

describe("buildSecretaryTodayOverview", () => {
  it("carries the operational counts and date through from the KPIs", () => {
    const today = new Date("2026-06-28T08:00:00");
    const overview = buildSecretaryTodayOverview(buildSecretaryKpis(BASE_INPUT), today);
    expect(overview).toEqual({
      today,
      pendingEnrollments: 4,
      pendingPayments: 3,
      overdueInvoices: 5,
      documentsToReview: 2,
      unreadNotifications: 7,
    });
  });
});

describe("resolveSecretaryQuickActions", () => {
  it("(24) hides actions whose target route does not exist", () => {
    const resolved = resolveSecretaryQuickActions(SECRETARY_QUICK_ACTION_CANDIDATES, KNOWN_SECRETARY_ROUTES);
    const hrefs = resolved.map((a) => a.href);
    // The "Enviar Notificação" candidate points at /notifications/new, which has
    // no page — it must be filtered out rather than rendered as a dead link.
    expect(hrefs).not.toContain("/notifications/new");
    expect(resolved.every((a) => KNOWN_SECRETARY_ROUTES.has(a.href))).toBe(true);
  });

  it("keeps the real routes (Nova Matrícula, Registar Pagamento, …)", () => {
    const hrefs = resolveSecretaryQuickActions(SECRETARY_QUICK_ACTION_CANDIDATES, KNOWN_SECRETARY_ROUTES).map((a) => a.href);
    expect(hrefs).toEqual(
      expect.arrayContaining(["/enrollments/new", "/students/new", "/payments/new", "/invoices/new"])
    );
  });

  it("returns nothing when no candidate route exists", () => {
    expect(resolveSecretaryQuickActions(SECRETARY_QUICK_ACTION_CANDIDATES, new Set())).toHaveLength(0);
  });

  it("(M2) hides actions the user is not permitted to perform", () => {
    // Custom role: route exists but lacks invoices.create → "Emitir Factura" hidden.
    const can = (p: string) => p !== "invoices.create";
    const hrefs = resolveSecretaryQuickActions(SECRETARY_QUICK_ACTION_CANDIDATES, KNOWN_SECRETARY_ROUTES, can).map(
      (a) => a.href
    );
    expect(hrefs).not.toContain("/invoices/new");
    expect(hrefs).toContain("/payments/new");
  });

  it("(M2) defaults to allow-all when no ability predicate is provided", () => {
    const withDefault = resolveSecretaryQuickActions(SECRETARY_QUICK_ACTION_CANDIDATES, KNOWN_SECRETARY_ROUTES);
    const withAllowAll = resolveSecretaryQuickActions(
      SECRETARY_QUICK_ACTION_CANDIDATES,
      KNOWN_SECRETARY_ROUTES,
      () => true
    );
    expect(withDefault).toEqual(withAllowAll);
  });
});

describe("mergeAndSortDeadlines", () => {
  function d(id: string, iso: string): SecretaryDeadline {
    return { id, type: "ACADEMIC_EVENT", title: id, date: new Date(iso), link: "/x" };
  }

  it("merges sources, sorts ascending by date, and caps to the limit", () => {
    const merged = mergeAndSortDeadlines(
      [
        [d("c", "2026-07-03T00:00:00"), d("a", "2026-07-01T00:00:00")],
        [d("b", "2026-07-02T00:00:00")],
      ],
      2
    );
    expect(merged.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
