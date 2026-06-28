import { getUnreadCount, getLatestForUser } from "@/modules/notifications/services/notification.service";
import {
  countPendingEnrollments,
  countActiveStudents,
  countPendingPayments,
  countOverdueInvoices,
  countDocumentsPendingReview,
  countFormingClassGroups,
} from "@/modules/secretary-portal/repositories/secretary-portal.repository";
import { buildSecretaryKpis, buildSecretaryTodayOverview } from "@/modules/secretary-portal/services/secretary-portal-kpis.service";
import { getSecretaryOperationalQueues } from "@/modules/secretary-portal/services/secretary-portal-queues.service";
import { getSecretaryFinancialAttention } from "@/modules/secretary-portal/services/secretary-portal-finance.service";
import { getSecretaryStudentAdministration } from "@/modules/secretary-portal/services/secretary-portal-students.service";
import { getSecretaryUpcomingDeadlines } from "@/modules/secretary-portal/services/secretary-portal-deadlines.service";
import { PERMISSIONS } from "@/server/auth/permissions";
import type { SecretaryPortalData, SecretaryQuickAction } from "@/modules/secretary-portal/types";

const NOTIFICATIONS_LIMIT = 8;

// ─── Quick actions ──────────────────────────────────────────────────────────────
// Candidate actions, the set of routes that actually exist, and the permission
// each action requires. The resolver below drops a candidate when its route is
// missing (so we never render a link to a 404 — e.g. "Enviar Notificação" →
// /notifications/new, which has no compose page yet) OR when the current user
// lacks the permission (so a custom role can never be sent to /forbidden).
// Keep KNOWN_SECRETARY_ROUTES in sync with the route tree under src/app/(org).

export const SECRETARY_QUICK_ACTION_CANDIDATES: SecretaryQuickAction[] = [
  { href: "/enrollments/new", label: "Nova Matrícula", iconName: "ClipboardList", variant: "default", requiredPermission: PERMISSIONS.ENROLLMENTS_CREATE },
  { href: "/students/new", label: "Novo Aluno", iconName: "GraduationCap", variant: "default", requiredPermission: PERMISSIONS.STUDENTS_CREATE },
  { href: "/payments/new", label: "Registar Pagamento", iconName: "CreditCard", variant: "success", requiredPermission: PERMISSIONS.PAYMENTS_CREATE },
  { href: "/invoices/new", label: "Emitir Factura", iconName: "FileText", variant: "default", requiredPermission: PERMISSIONS.INVOICES_CREATE },
  { href: "/enrollments", label: "Ver Matrículas Pendentes", iconName: "ClipboardCheck", variant: "warning", requiredPermission: PERMISSIONS.ENROLLMENTS_VIEW },
  { href: "/payments", label: "Ver Pagamentos", iconName: "Wallet", variant: "default", requiredPermission: PERMISSIONS.PAYMENTS_VIEW },
  // No compose route exists yet — intentionally filtered out by the resolver.
  { href: "/notifications/new", label: "Enviar Notificação", iconName: "Bell", variant: "default", requiredPermission: PERMISSIONS.NOTIFICATIONS_VIEW_OWN },
  { href: "/students/import", label: "Importar Dados", iconName: "Upload", variant: "default", requiredPermission: PERMISSIONS.STUDENTS_IMPORT },
];

export const KNOWN_SECRETARY_ROUTES: ReadonlySet<string> = new Set([
  "/enrollments/new",
  "/students/new",
  "/payments/new",
  "/invoices/new",
  "/enrollments",
  "/payments",
  "/students/import",
]);

/**
 * Pure: keep only actions whose target route exists AND whose required
 * permission the user holds. `can` defaults to allow-all so callers without an
 * ability (and existing tests) keep the route-only behaviour.
 */
export function resolveSecretaryQuickActions(
  candidates: SecretaryQuickAction[],
  existingRoutes: ReadonlySet<string>,
  can: (permission: string) => boolean = () => true
): SecretaryQuickAction[] {
  return candidates.filter(
    (action) =>
      existingRoutes.has(action.href) && (!action.requiredPermission || can(action.requiredPermission))
  );
}

// ─── Main aggregate ──────────────────────────────────────────────────────────────

/**
 * Operational data for the secretary's workspace. organizationId is resolved
 * server-side from the active org (never the URL); userId scopes only the
 * notifications panel. Everything else is org-wide operational data the
 * secretary is entitled to act on.
 */
export async function getSecretaryPortalData(
  userId: string,
  organizationId: string,
  can: (permission: string) => boolean = () => true,
  now: Date = new Date()
): Promise<SecretaryPortalData> {
  const [
    pendingEnrollments,
    activeStudents,
    pendingPayments,
    overdueInvoices,
    documentsToReview,
    formingClassGroups,
    unreadNotificationCount,
    notifications,
    queues,
    financialAttention,
    studentAdministration,
    deadlines,
  ] = await Promise.all([
    countPendingEnrollments(organizationId),
    countActiveStudents(organizationId),
    countPendingPayments(organizationId),
    countOverdueInvoices(organizationId, now),
    countDocumentsPendingReview(organizationId),
    countFormingClassGroups(organizationId),
    getUnreadCount(organizationId, userId),
    getLatestForUser(organizationId, userId, NOTIFICATIONS_LIMIT),
    getSecretaryOperationalQueues(organizationId, now),
    getSecretaryFinancialAttention(organizationId, now),
    getSecretaryStudentAdministration(organizationId),
    getSecretaryUpcomingDeadlines(organizationId, now),
  ]);

  const kpis = buildSecretaryKpis({
    pendingEnrollments,
    activeStudents,
    pendingPayments,
    overdueInvoices,
    documentsToReview,
    unreadNotifications: unreadNotificationCount,
    formingClassGroups,
  });

  const quickActions = resolveSecretaryQuickActions(
    SECRETARY_QUICK_ACTION_CANDIDATES,
    KNOWN_SECRETARY_ROUTES,
    can
  );

  return {
    kpis,
    todayOverview: buildSecretaryTodayOverview(kpis, now),
    quickActions,
    queues,
    financialAttention,
    studentAdministration,
    documentsCompliance: {
      // Required-document rules don't exist in the schema yet — never faked.
      requiredDocsConfigured: false,
      pendingReviewCount: documentsToReview,
      // StudentDocument has no expiry field — null until the schema supports it.
      expiredCount: null,
    },
    notifications,
    unreadNotificationCount,
    deadlines,
  };
}
