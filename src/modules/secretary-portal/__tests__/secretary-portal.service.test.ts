import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Reused services & repository are mocked to assert orchestration/reuse ──────
const { mockGetUnreadCount, mockGetLatestForUser } = vi.hoisted(() => ({
  mockGetUnreadCount: vi.fn(),
  mockGetLatestForUser: vi.fn(),
}));
vi.mock("@/modules/notifications/services/notification.service", () => ({
  getUnreadCount: mockGetUnreadCount,
  getLatestForUser: mockGetLatestForUser,
}));

vi.mock("../repositories/secretary-portal.repository", () => ({
  countPendingEnrollments: vi.fn(async () => 4),
  countActiveStudents: vi.fn(async () => 120),
  countPendingPayments: vi.fn(async () => 3),
  countOverdueInvoices: vi.fn(async () => 5),
  countDocumentsPendingReview: vi.fn(async () => 2),
  countFormingClassGroups: vi.fn(async () => 1),
}));

vi.mock("../services/secretary-portal-queues.service", () => ({
  getSecretaryOperationalQueues: vi.fn(async () => ({
    pendingEnrollments: [],
    attentionInvoices: [],
    documentsToReview: [],
    recentStudents: [],
  })),
}));
vi.mock("../services/secretary-portal-finance.service", () => ({
  getSecretaryFinancialAttention: vi.fn(async () => ({
    overdueInvoiceCount: 5,
    overdueAmount: 250,
    pendingPaymentCount: 3,
    pendingPaymentAmount: 90,
    pendingRefundCount: 0,
    pendingRefundAmount: 0,
  })),
}));
vi.mock("../services/secretary-portal-students.service", () => ({
  getSecretaryStudentAdministration: vi.fn(async () => ({
    withoutPortalAccount: 0,
    missingEmail: 0,
    inactiveWithActiveEnrollment: 0,
    enrollmentWithoutClassGroup: 0,
    enrollmentWithoutLevel: 0,
    studentsWithoutPortalAccount: [],
  })),
}));
vi.mock("../services/secretary-portal-deadlines.service", () => ({
  getSecretaryUpcomingDeadlines: vi.fn(async () => []),
}));

import { getSecretaryPortalData } from "../services/secretary-portal.service";

const ORG = "org-1";
const USER = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUnreadCount.mockResolvedValue(7);
  mockGetLatestForUser.mockResolvedValue([{ id: "n1" }]);
});

describe("getSecretaryPortalData", () => {
  it("(19) sources notifications + unread count from the existing NotificationService", async () => {
    const data = await getSecretaryPortalData(USER, ORG);
    expect(mockGetUnreadCount).toHaveBeenCalledWith(ORG, USER);
    expect(mockGetLatestForUser).toHaveBeenCalledWith(ORG, USER, 8);
    expect(data.notifications).toEqual([{ id: "n1" }]);
    expect(data.unreadNotificationCount).toBe(7);
    expect(data.kpis.unreadNotifications).toBe(7);
  });

  it("builds KPIs from the aggregated counts and derives urgent tasks", async () => {
    const data = await getSecretaryPortalData(USER, ORG);
    expect(data.kpis).toMatchObject({
      pendingEnrollments: 4,
      activeStudents: 120,
      pendingPayments: 3,
      overdueInvoices: 5,
      documentsToReview: 2,
      formingClassGroups: 1,
      urgentTasks: 4 + 3 + 5 + 2,
    });
  });

  it("never fakes document compliance — required docs flagged as not configured, expiry null", async () => {
    const data = await getSecretaryPortalData(USER, ORG);
    expect(data.documentsCompliance).toEqual({
      requiredDocsConfigured: false,
      pendingReviewCount: 2,
      expiredCount: null,
    });
  });

  it("(24) only surfaces quick actions for routes that exist", async () => {
    const data = await getSecretaryPortalData(USER, ORG);
    expect(data.quickActions.map((a) => a.href)).not.toContain("/notifications/new");
    expect(data.quickActions.length).toBeGreaterThan(0);
  });
});
