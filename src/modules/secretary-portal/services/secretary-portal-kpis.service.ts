import type { SecretaryPortalKpis, SecretaryTodayOverview } from "@/modules/secretary-portal/types";

// =============================================================================
// SECRETARY PORTAL — KPI & TODAY-OVERVIEW BUILDERS (pure)
// Take already-aggregated counts and shape them. No DB access here so the
// derivation logic (notably the "urgent tasks" formula) is unit-testable.
// =============================================================================

export interface SecretaryKpiInputs {
  pendingEnrollments: number;
  activeStudents: number;
  pendingPayments: number;
  overdueInvoices: number;
  documentsToReview: number;
  unreadNotifications: number;
  formingClassGroups: number;
}

/** Urgent = the actionable backlog the secretary should clear first. */
export function computeUrgentTasks(inputs: SecretaryKpiInputs): number {
  return (
    inputs.overdueInvoices +
    inputs.pendingEnrollments +
    inputs.pendingPayments +
    inputs.documentsToReview
  );
}

export function buildSecretaryKpis(inputs: SecretaryKpiInputs): SecretaryPortalKpis {
  return {
    pendingEnrollments: inputs.pendingEnrollments,
    activeStudents: inputs.activeStudents,
    pendingPayments: inputs.pendingPayments,
    overdueInvoices: inputs.overdueInvoices,
    documentsToReview: inputs.documentsToReview,
    unreadNotifications: inputs.unreadNotifications,
    formingClassGroups: inputs.formingClassGroups,
    urgentTasks: computeUrgentTasks(inputs),
  };
}

export function buildSecretaryTodayOverview(
  kpis: SecretaryPortalKpis,
  today: Date
): SecretaryTodayOverview {
  return {
    today,
    pendingEnrollments: kpis.pendingEnrollments,
    pendingPayments: kpis.pendingPayments,
    overdueInvoices: kpis.overdueInvoices,
    documentsToReview: kpis.documentsToReview,
    unreadNotifications: kpis.unreadNotifications,
  };
}
