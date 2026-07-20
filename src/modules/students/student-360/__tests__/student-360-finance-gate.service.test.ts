import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// H1 — Finance permission boundary. The Student 360 aggregator must NOT query,
// compute, or return finance data when the viewer lacks finance permission.
// These tests assert the finance SERVICE is never invoked (not merely masked).
// =============================================================================

const h = vi.hoisted(() => ({
  getStudentById: vi.fn(),
  getEnrollmentsByOrganization: vi.fn(),
  getStudentFinancialStatement: vi.fn(),
  findProgressByOrganization: vi.fn(),
  getStudentSubjectAttendanceViews: vi.fn(),
  getStudentAttendanceCounts: vi.fn(),
  findJustificationsByOrganization: vi.fn(),
  findStudentAssessmentResults: vi.fn(),
  getRecentTimelineEvents: vi.fn(),
  getStudentTimeline: vi.fn(),
  getStudentDocuments: vi.fn(),
  getStudentDocumentCount: vi.fn(),
  getLevelSubjectsByLevel: vi.fn(),
  evaluateEligibilityForAllSubjects: vi.fn(),
  getWalletByStudentId: vi.fn(),
  getRecentTransactions: vi.fn(),
  findAttendanceRecordsByStudent: vi.fn(),
  findLevelProgressByStudent: vi.fn(),
  findCourseProgressByStudent: vi.fn(),
  findLastActivityAt: vi.fn(),
}));

vi.mock("@/modules/students/services/student.service", () => ({ getStudentById: h.getStudentById }));
vi.mock("@/modules/enrollments/services/enrollment.service", () => ({
  getEnrollmentsByOrganization: h.getEnrollmentsByOrganization,
}));
vi.mock("@/modules/reports/finance/services/financial-reports.service", () => ({
  getStudentFinancialStatement: h.getStudentFinancialStatement,
}));
vi.mock("@/modules/assessments/repositories/student-subject-progress.repository", () => ({
  findProgressByOrganization: h.findProgressByOrganization,
}));
vi.mock("@/modules/attendance/services/attendance-read-model.service", () => ({
  getStudentSubjectAttendanceViews: h.getStudentSubjectAttendanceViews,
  getStudentAttendanceCounts: h.getStudentAttendanceCounts,
}));
vi.mock("@/modules/attendance/repositories/attendance-justification.repository", () => ({
  findJustificationsByOrganization: h.findJustificationsByOrganization,
}));
vi.mock("@/modules/grades/repositories/student-assessment-result.repository", () => ({
  findStudentAssessmentResults: h.findStudentAssessmentResults,
}));
vi.mock("@/modules/student-timeline/services/student-timeline.service", () => ({
  getRecentTimelineEvents: h.getRecentTimelineEvents,
  getStudentTimeline: h.getStudentTimeline,
}));
vi.mock("@/modules/student-documents/services/student-document.service", () => ({
  getStudentDocuments: h.getStudentDocuments,
  getStudentDocumentCount: h.getStudentDocumentCount,
}));
vi.mock("@/modules/courses/services/course.service", () => ({
  getLevelSubjectsByLevel: h.getLevelSubjectsByLevel,
}));
vi.mock("@/modules/prerequisites/engines/subject-eligibility.engine", () => ({
  evaluateEligibilityForAllSubjects: h.evaluateEligibilityForAllSubjects,
  evaluateSubjectEligibility: vi.fn(),
}));
vi.mock("@/modules/wallets/services/wallet.service", () => ({
  getWalletByStudentId: h.getWalletByStudentId,
  getRecentTransactions: h.getRecentTransactions,
}));
vi.mock("@/modules/students/student-360/repositories/student-360.repository", () => ({
  findAttendanceRecordsByStudent: h.findAttendanceRecordsByStudent,
  findLevelProgressByStudent: h.findLevelProgressByStudent,
  findCourseProgressByStudent: h.findCourseProgressByStudent,
  findLastActivityAt: h.findLastActivityAt,
}));

import { getStudent360Core } from "../services/student-360.service";

const ORG = "org-1";
const STUDENT = "student-1";

const STATEMENT = {
  invoices: [{ status: "OVERDUE" }],
  payments: [],
  receipts: [],
  refunds: [{ status: "REQUESTED" }],
  kpis: { outstandingBalance: 500, walletBalance: 20, totalInvoiced: 500, totalPaid: 0, totalRefunded: 0, creditApplied: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getStudentById.mockResolvedValue({ id: STUDENT, organizationId: ORG });
  h.getEnrollmentsByOrganization.mockResolvedValue({ data: [] });
  h.findProgressByOrganization.mockResolvedValue({ data: [] });
  h.findLevelProgressByStudent.mockResolvedValue([]);
  h.findCourseProgressByStudent.mockResolvedValue([]);
  h.findLastActivityAt.mockResolvedValue(null);
  h.getRecentTimelineEvents.mockResolvedValue([]);
  h.getStudentDocumentCount.mockResolvedValue(0);
  h.findJustificationsByOrganization.mockResolvedValue({ total: 0, data: [] });
  h.getStudentSubjectAttendanceViews.mockResolvedValue([]);
  h.getStudentAttendanceCounts.mockResolvedValue({
    totalSessions: 0, presentCount: 0, absentCount: 0, lateCount: 0, excusedCount: 0, remoteCount: 0,
  });
  // Finance mocks — should only ever be reached when authorized.
  h.getStudentFinancialStatement.mockResolvedValue(STATEMENT);
  h.getWalletByStudentId.mockResolvedValue({ id: "wallet-1" });
  h.getRecentTransactions.mockResolvedValue([]);
});

describe("getStudent360Core — finance permission boundary (billing vs wallet)", () => {
  it("BOTH capabilities: fetches statement + wallet and populates both halves", async () => {
    const core = await getStudent360Core(STUDENT, ORG, { canViewInvoices: true, canViewWallet: true });

    expect(h.getStudentFinancialStatement).toHaveBeenCalledWith({ organizationId: ORG, studentId: STUDENT });
    expect(h.getWalletByStudentId).toHaveBeenCalledWith(STUDENT, ORG);
    expect(core.finance?.billing).not.toBeNull();
    expect(core.finance?.billing?.outstandingBalance).toBe(500);
    expect(core.finance?.wallet).not.toBeNull();
    expect(core.finance?.wallet?.walletBalance).toBe(20);
    expect(core.finance?.wallet?.wallet).toEqual({ id: "wallet-1" });
  });

  it("NEITHER capability: no finance query at all and core.finance is null", async () => {
    const core = await getStudent360Core(STUDENT, ORG, { canViewInvoices: false, canViewWallet: false });

    // No finance query, no finance computation, no finance payload.
    expect(h.getStudentFinancialStatement).not.toHaveBeenCalled();
    expect(h.getWalletByStudentId).not.toHaveBeenCalled();
    expect(h.getRecentTransactions).not.toHaveBeenCalled();
    expect(core.finance).toBeNull();
  });

  it("ONLY invoices: billing present, wallet absent, NO wallet query issued", async () => {
    const core = await getStudent360Core(STUDENT, ORG, { canViewInvoices: true, canViewWallet: false });

    // The statement is still read (billing source), but the wallet entity/movements are not.
    expect(h.getStudentFinancialStatement).toHaveBeenCalled();
    expect(h.getWalletByStudentId).not.toHaveBeenCalled();
    expect(h.getRecentTransactions).not.toHaveBeenCalled();
    expect(core.finance?.billing).not.toBeNull();
    expect(core.finance?.wallet).toBeNull();
    // The billing projection must NOT carry any wallet figure.
    expect(core.finance?.billing).not.toHaveProperty("walletBalance");
  });

  it("ONLY wallet: wallet present, billing absent", async () => {
    const core = await getStudent360Core(STUDENT, ORG, { canViewInvoices: false, canViewWallet: true });

    // The statement is read (wallet KPIs live there) and the wallet entity is fetched.
    expect(h.getStudentFinancialStatement).toHaveBeenCalled();
    expect(h.getWalletByStudentId).toHaveBeenCalledWith(STUDENT, ORG);
    expect(core.finance?.wallet).not.toBeNull();
    expect(core.finance?.wallet?.walletBalance).toBe(20);
    expect(core.finance?.billing).toBeNull();
    // The wallet projection must NOT carry any billing figure.
    expect(core.finance?.wallet).not.toHaveProperty("outstandingBalance");
  });

  it("non-finance sections load identically regardless of finance permission", async () => {
    await getStudent360Core(STUDENT, ORG, { canViewInvoices: false, canViewWallet: false });
    expect(h.getEnrollmentsByOrganization).toHaveBeenCalled();
    expect(h.findProgressByOrganization).toHaveBeenCalled();
    expect(h.getStudentSubjectAttendanceViews).toHaveBeenCalled();
    expect(h.getStudentDocumentCount).toHaveBeenCalled();
  });
});
