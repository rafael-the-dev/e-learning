import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// F-M6 — Per-dimension permission boundary. The Student 360 aggregator must NOT
// query, compute, or return a NON-FINANCE dimension (academic / attendance /
// progression / documents / timeline) when the viewer lacks that permission.
//
// These tests assert the underlying SERVICES/REPOSITORIES are never invoked (not
// merely masked on the way out), that the DTO section is absent, that no risk
// reason for a hidden dimension is produced, and — crucially — that the global
// risk level can never leak a hidden dimension (no-inference).
// =============================================================================

const h = vi.hoisted(() => ({
  getStudentById: vi.fn(),
  getEnrollmentsByOrganization: vi.fn(),
  getStudentFinanceSummary: vi.fn(),
  findProgressByOrganization: vi.fn(),
  getStudentSubjectAttendanceViews: vi.fn(),
  getStudentAttendanceSummary: vi.fn(),
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
  getStudentFinanceSummary: h.getStudentFinanceSummary,
  getStudentInvoicesPage: vi.fn(),
  getStudentPaymentsPage: vi.fn(),
  getStudentReceiptsPage: vi.fn(),
  getStudentRefundsPage: vi.fn(),
}));
vi.mock("@/modules/assessments/repositories/student-subject-progress.repository", () => ({
  findProgressByOrganization: h.findProgressByOrganization,
}));
vi.mock("@/modules/attendance/services/attendance-read-model.service", () => ({
  getStudentSubjectAttendanceViews: h.getStudentSubjectAttendanceViews,
  getStudentAttendanceSummary: h.getStudentAttendanceSummary,
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
  loadEligibilityEvaluationContext: vi.fn(),
  evaluateEligibilityForAllSubjects: h.evaluateEligibilityForAllSubjects,
  evaluateSubjectEligibility: vi.fn(),
}));
vi.mock("@/modules/wallets/services/wallet.service", () => ({
  getWalletByStudentId: h.getWalletByStudentId,
  getRecentTransactions: h.getRecentTransactions,
}));
vi.mock("@/modules/students/student-360/repositories/student-360.repository", () => ({
  findAttendanceRecordsByStudent: h.findAttendanceRecordsByStudent,
  findLastActivityAt: h.findLastActivityAt,
}));
vi.mock("@/modules/prerequisites/repositories/student-level-progress.repository", () => ({
  findLevelProgressByStudent: h.findLevelProgressByStudent,
}));
vi.mock("@/modules/prerequisites/repositories/student-course-progress.repository", () => ({
  findCourseProgressByStudent: h.findCourseProgressByStudent,
}));

import { getStudent360Core } from "../services/student-360.service";
import type { Student360Capabilities } from "@/modules/students/student-360/types";

const ORG = "org-1";
const STUDENT = "student-1";

// Every non-finance dimension carries a problem, so that hiding a dimension must make its
// reason/section disappear — a strong signal that gating happens before compute, not after.
function seedRiskyStudent() {
  h.getEnrollmentsByOrganization.mockResolvedValue({
    data: [{ id: "enr-1", status: "ACTIVE", classGroupId: "cg-1" }],
  });
  // A BLOCKED level (CRITICAL progression) + a below-required subject (CRITICAL attendance).
  h.findLevelProgressByStudent.mockResolvedValue([{ status: "BLOCKED" }]);
  h.findCourseProgressByStudent.mockResolvedValue([]);
  h.getStudentSubjectAttendanceViews.mockResolvedValue([{ status: "BELOW_REQUIRED" }]);
  h.getStudentAttendanceSummary.mockResolvedValue({
    totalSessions: 10, presentCount: 5, absentCount: 5, lateCount: 0, excusedCount: 0, remoteCount: 0,
    attendancePercentage: 50, attendedSessions: 5,
  });
  // Zero documents → the "missing-documents" HIGH reason fires only when documents is visible.
  h.getStudentDocumentCount.mockResolvedValue(0);
  h.findJustificationsByOrganization.mockResolvedValue({ total: 0, data: [] });
  h.findProgressByOrganization.mockResolvedValue({ data: [] });
  h.getRecentTimelineEvents.mockResolvedValue([]);
}

const ALL_HIDDEN_EXCEPT_FINANCE: Student360Capabilities = {
  canViewInvoices: false,
  canViewWallet: false,
  canViewAcademic: false,
  canViewAttendance: false,
  canViewProgression: false,
  canViewDocuments: false,
  canViewTimeline: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getStudentById.mockResolvedValue({ id: STUDENT, organizationId: ORG });
  seedRiskyStudent();
});

describe("getStudent360Core — F-M6 academic gating", () => {
  it("academic hidden: no academic query, null summary, no academic figures in the DTO", async () => {
    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewAcademic: false,
    });

    expect(h.findProgressByOrganization).not.toHaveBeenCalled();
    expect(core.academicSummary).toBeNull();
    expect(core.subjectProgress).toEqual([]);
    // No academic field name may appear anywhere in the serialized DTO.
    const json = JSON.stringify(core);
    expect(json).not.toContain("progressionStatus");
    expect(json).not.toContain("subjectAverage");
    // No academic risk reason.
    expect(core.riskSummary.reasons.some((r) => r.dimension === "academic")).toBe(false);
  });
});

describe("getStudent360Core — F-M6 attendance gating", () => {
  it("attendance hidden: no attendance query, null summary, no attendance figures/reason", async () => {
    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewAttendance: false,
    });

    expect(h.getStudentSubjectAttendanceViews).not.toHaveBeenCalled();
    expect(h.getStudentAttendanceSummary).not.toHaveBeenCalled();
    // Pending justifications are an attendance signal — also skipped.
    expect(h.findJustificationsByOrganization).not.toHaveBeenCalled();
    expect(core.attendanceSummary).toBeNull();
    expect(core.attendanceSubjects).toEqual([]);
    expect(JSON.stringify(core)).not.toContain("attendancePercentage");
    expect(core.riskSummary.reasons.some((r) => r.dimension === "attendance")).toBe(false);
  });
});

describe("getStudent360Core — F-M6 progression gating", () => {
  it("progression + academic hidden: no progress-row query, empty arrays, no progression reason", async () => {
    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewProgression: false, canViewAcademic: false,
    });

    expect(h.findLevelProgressByStudent).not.toHaveBeenCalled();
    expect(h.findCourseProgressByStudent).not.toHaveBeenCalled();
    expect(core.levelProgress).toEqual([]);
    expect(core.courseProgress).toEqual([]);
    expect(core.riskSummary.reasons.some((r) => r.dimension === "progression")).toBe(false);
  });

  it("academic visible but progression hidden: rows are fetched (academic needs them) but the DTO arrays are gated", async () => {
    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewProgression: false, canViewAcademic: true,
    });

    // The academic summary depends on level/course rows, so they are read …
    expect(h.findLevelProgressByStudent).toHaveBeenCalled();
    // … but the progression DTO arrays and the progression risk reason are still gated.
    expect(core.levelProgress).toEqual([]);
    expect(core.courseProgress).toEqual([]);
    expect(core.riskSummary.reasons.some((r) => r.dimension === "progression")).toBe(false);
  });
});

describe("getStudent360Core — F-M6 documents gating", () => {
  it("documents hidden: no document-count query, null count, no missing-documents reason", async () => {
    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewDocuments: false,
    });

    expect(h.getStudentDocumentCount).not.toHaveBeenCalled();
    expect(core.documentCount).toBeNull();
    expect(core.riskSummary.documents).toBeNull();
    // Even though there are 0 documents, the reason must NOT be produced when unauthorized.
    expect(core.riskSummary.reasons.some((r) => r.id === "missing-documents")).toBe(false);
  });

  it("documents visible with 0 docs: the missing-documents reason IS produced (control)", async () => {
    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewDocuments: true,
    });

    expect(h.getStudentDocumentCount).toHaveBeenCalled();
    expect(core.documentCount).toBe(0);
    expect(core.riskSummary.reasons.some((r) => r.id === "missing-documents")).toBe(true);
  });
});

describe("getStudent360Core — F-M6 timeline gating", () => {
  it("timeline hidden: no timeline query and an empty recent-activity list", async () => {
    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewTimeline: false,
    });

    expect(h.getRecentTimelineEvents).not.toHaveBeenCalled();
    expect(core.recentTimeline).toEqual([]);
  });

  it("recent activity is filtered by dimension — a finance event is dropped when finance is not authorized", async () => {
    h.getRecentTimelineEvents.mockResolvedValue([
      { id: "t1", eventType: "INVOICE_OVERDUE" },
      { id: "t2", eventType: "ENROLLMENT_CREATED" },
      { id: "t3", eventType: "ATTENDANCE_MARKED" },
    ]);

    const core = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewAttendance: false,
    });

    const ids = core.recentTimeline.map((e) => e.id);
    // Finance event dropped (no finance permission), attendance event dropped (hidden),
    // enrollment event kept (not gated).
    expect(ids).toEqual(["t2"]);
    expect(JSON.stringify(core.recentTimeline)).not.toContain("INVOICE_OVERDUE");
  });
});

describe("getStudent360Core — F-M6 no-inference on the global risk level", () => {
  it("a hidden CRITICAL progression risk does NOT raise the global level", async () => {
    // Control: with progression visible, the BLOCKED level makes the student CRITICAL.
    const visible = await getStudent360Core(STUDENT, ORG, {
      canViewInvoices: false, canViewWallet: false, canViewProgression: true, canViewAcademic: false,
      canViewAttendance: false, canViewDocuments: false, canViewTimeline: false,
    });
    expect(visible.riskSummary.level).toBe("CRITICAL");

    // Hidden: the very same BLOCKED level must not leak through the global level.
    const hidden = await getStudent360Core(STUDENT, ORG, ALL_HIDDEN_EXCEPT_FINANCE);
    expect(hidden.riskSummary.level).not.toBe("CRITICAL");
    expect(hidden.riskSummary.reasons.some((r) => r.dimension === "progression")).toBe(false);
  });

  it("everything hidden: the DTO carries no sensitive dimension figures at all", async () => {
    const core = await getStudent360Core(STUDENT, ORG, ALL_HIDDEN_EXCEPT_FINANCE);

    const json = JSON.stringify(core);
    expect(json).not.toContain("progressionStatus");
    expect(json).not.toContain("subjectAverage");
    expect(json).not.toContain("attendancePercentage");
    expect(core.academicSummary).toBeNull();
    expect(core.attendanceSummary).toBeNull();
    expect(core.documentCount).toBeNull();
    expect(core.recentTimeline).toEqual([]);
  });
});
