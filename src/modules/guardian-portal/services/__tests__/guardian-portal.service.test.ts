import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  findGuardianLinks: vi.fn(),
  findGuardianLink: vi.fn(),
  findGuardianStudentEnrollmentSummaries: vi.fn(),
  getStudent360Core: vi.fn(),
  resolveCurrentEnrollmentLevel: vi.fn(),
  findAttendanceRecordsByStudent: vi.fn(),
  getStudentDocuments: vi.fn(),
  findStudentUpcomingClasses: vi.fn(),
  findStudentAssessments: vi.fn(),
  findStudentPublishedGrades: vi.fn(),
  findStudentAttendanceForStats: vi.fn(),
  findSubjectNamesByIds: vi.fn(),
  getGuardianNotifications: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/modules/guardian-portal/repositories/guardian-portal.repository", () => ({
  findGuardianLinks: h.findGuardianLinks,
  findGuardianLink: h.findGuardianLink,
  findGuardianStudentEnrollmentSummaries: h.findGuardianStudentEnrollmentSummaries,
}));
vi.mock("@/modules/students/student-360/services/student-360.service", () => ({
  getStudent360Core: h.getStudent360Core,
  resolveCurrentEnrollmentLevel: h.resolveCurrentEnrollmentLevel,
}));
vi.mock("@/modules/students/student-360/repositories/student-360.repository", () => ({
  findAttendanceRecordsByStudent: h.findAttendanceRecordsByStudent,
}));
vi.mock("@/modules/student-documents/services/student-document.service", () => ({
  getStudentDocuments: h.getStudentDocuments,
}));
vi.mock("@/modules/student-portal/repositories/student-portal.repository", () => ({
  findStudentUpcomingClasses: h.findStudentUpcomingClasses,
  findStudentAssessments: h.findStudentAssessments,
  findStudentPublishedGrades: h.findStudentPublishedGrades,
  findStudentAttendanceForStats: h.findStudentAttendanceForStats,
  findSubjectNamesByIds: h.findSubjectNamesByIds,
}));
vi.mock("@/modules/guardian-portal/services/guardian-portal-notifications.service", () => ({
  getGuardianNotifications: h.getGuardianNotifications,
}));
vi.mock("@/server/db", () => ({
  getDb: vi.fn().mockResolvedValue({ user: { findUnique: h.userFindUnique } }),
}));

import { getGuardianPortalData } from "../guardian-portal.service";
import { NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";

function makeCore() {
  return {
    student: { code: "S-001", status: "ACTIVE" },
    currentEnrollment: { status: "ACTIVE", courseName: "Curso A", classGroupName: "Turma 1" },
    activeEnrollments: [{ classGroupId: "cg1" }],
    subjectProgress: [{ status: "PASSED" }, { status: "IN_PROGRESS" }],
    levelProgress: [],
    statement: {
      invoices: [
        { invoiceId: "i1", invoiceNumber: "F1", issueDate: new Date(), dueDate: new Date("2026-12-01"), totalAmount: 100, paidAmount: 0, balanceAmount: 100, status: "PENDING" },
      ],
      payments: [],
      kpis: { outstandingBalance: 100, walletBalance: 0 },
    },
  };
}

const ctx = {
  userId: "guardian-user",
  organizationId: "org-1",
  roles: ["GUARDIAN"],
} as unknown as AuthContext;

interface Flags {
  canViewAcademic?: boolean;
  canViewAttendance?: boolean;
  canViewFinance?: boolean;
  canViewDocuments?: boolean;
  canReceiveNotifications?: boolean;
}

function link(studentId: string, flags: Flags = {}) {
  return {
    linkId: `link-${studentId}`,
    studentId,
    relationshipType: "MOTHER",
    isPrimary: true,
    canViewAcademic: flags.canViewAcademic ?? true,
    canViewAttendance: flags.canViewAttendance ?? true,
    canViewFinance: flags.canViewFinance ?? true,
    canViewDocuments: flags.canViewDocuments ?? true,
    canReceiveNotifications: flags.canReceiveNotifications ?? true,
    student: { firstName: "Ana", lastName: "Silva", code: studentId, status: "ACTIVE" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  h.findGuardianLinks.mockResolvedValue([link("s1")]);
  h.findGuardianLink.mockResolvedValue(null);
  h.findGuardianStudentEnrollmentSummaries.mockResolvedValue(
    new Map([["s1", { studentId: "s1", courseName: "Curso A", classGroupName: "Turma 1" }]])
  );
  h.getStudent360Core.mockResolvedValue(makeCore());
  h.resolveCurrentEnrollmentLevel.mockReturnValue({ id: "lvl1", name: "Nível 1" });
  h.findStudentPublishedGrades.mockResolvedValue([
    { id: "g1", subjectId: "sub1", assessmentTitle: "Teste 1", score: 80, maxScore: 100, status: "PASSED", publishedAt: new Date() },
  ]);
  h.findStudentAssessments.mockResolvedValue([
    { assessmentId: "a1", title: "Exame", subjectId: "sub1", assessmentDate: new Date("2030-01-01"), status: "SCHEDULED", isPublished: false, score: null, maxScore: 100 },
  ]);
  h.findSubjectNamesByIds.mockResolvedValue(new Map([["sub1", "Matemática"]]));
  h.findStudentAttendanceForStats.mockResolvedValue([
    { status: "PRESENT", sessionDate: new Date("2026-05-01") },
    { status: "ABSENT", sessionDate: new Date("2026-05-02") },
  ]);
  h.findStudentUpcomingClasses.mockResolvedValue([
    { id: "c1", sessionDate: new Date(), startTime: "08:00", endTime: "09:00", subjectName: "Mat", teacherName: "Prof", classroomName: "A1", status: "SCHEDULED" },
  ]);
  h.findAttendanceRecordsByStudent.mockResolvedValue({
    data: [{ id: "r1", sessionDate: new Date(), subjectName: "Mat", status: "PRESENT" }],
  });
  h.getStudentDocuments.mockResolvedValue([
    { id: "d1", documentType: "CERTIFICATE", fileName: "cert.pdf", fileUrl: "/f", status: "VERIFIED", createdAt: new Date() },
  ]);
  h.getGuardianNotifications.mockResolvedValue({
    notifications: [{ id: "n1", title: "Aviso" }],
    unreadCount: 3,
  });
  h.userFindUnique.mockResolvedValue({ name: "Maria" });
});

describe("getGuardianPortalData — blocked state", () => {
  it("returns no students and null selection when the guardian has no links", async () => {
    h.findGuardianLinks.mockResolvedValue([]);
    const data = await getGuardianPortalData(ctx);
    expect(data.students).toEqual([]);
    expect(data.selected).toBeNull();
    // The guardian's own notifications are still returned.
    expect(data.notifications).toHaveLength(1);
    expect(h.getStudent360Core).not.toHaveBeenCalled();
  });
});

describe("getGuardianPortalData — all visibility granted", () => {
  it("fetches the selected student's data scoped to that studentId", async () => {
    const data = await getGuardianPortalData(ctx);
    expect(h.getStudent360Core).toHaveBeenCalledWith("s1", "org-1");
    expect(data.selectedStudentId).toBe("s1");
    expect(data.selected?.grades).not.toBeNull();
    expect(data.selected?.attendanceKpis).not.toBeNull();
    expect(data.selected?.paymentsSummary).not.toBeNull();
    expect(data.selected?.documents).not.toBeNull();
    expect(data.selected?.kpis.unreadNotifications).toBe(3);
  });

  it("populates the student selector with course/class labels", async () => {
    const data = await getGuardianPortalData(ctx);
    expect(data.students).toHaveLength(1);
    expect(data.students[0]).toMatchObject({ studentId: "s1", courseName: "Curso A", classGroupName: "Turma 1" });
  });
});

describe("getGuardianPortalData — per-link visibility gating", () => {
  it("canViewAcademic=false hides grades, assessments and academic KPIs (and never queries them)", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1", { canViewAcademic: false })]);
    const data = await getGuardianPortalData(ctx);
    expect(data.selected?.grades).toBeNull();
    expect(data.selected?.assessments).toBeNull();
    expect(data.selected?.kpis.overallAverage).toBeNull();
    expect(data.selected?.kpis.approvedSubjects).toBeNull();
    expect(h.findStudentPublishedGrades).not.toHaveBeenCalled();
    expect(h.findStudentAssessments).not.toHaveBeenCalled();
  });

  it("canViewAttendance=false hides attendance (and never queries it)", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1", { canViewAttendance: false })]);
    const data = await getGuardianPortalData(ctx);
    expect(data.selected?.attendanceKpis).toBeNull();
    expect(data.selected?.kpis.averageAttendance).toBeNull();
    expect(data.selected?.kpis.absences).toBeNull();
    expect(h.findStudentAttendanceForStats).not.toHaveBeenCalled();
  });

  it("canViewFinance=false hides payments (and never reads the statement into the section)", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1", { canViewFinance: false })]);
    const data = await getGuardianPortalData(ctx);
    expect(data.selected?.paymentsSummary).toBeNull();
    expect(data.selected?.invoices).toEqual([]);
    expect(data.selected?.kpis.pendingInvoices).toBeNull();
    expect(data.selected?.kpis.outstandingBalance).toBeNull();
  });

  it("canViewDocuments=false hides documents (and never queries them)", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1", { canViewDocuments: false })]);
    const data = await getGuardianPortalData(ctx);
    expect(data.selected?.documents).toBeNull();
    expect(h.getStudentDocuments).not.toHaveBeenCalled();
  });

  it("canReceiveNotifications=false hides the unread-notification KPI", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1", { canReceiveNotifications: false })]);
    const data = await getGuardianPortalData(ctx);
    expect(data.selected?.kpis.unreadNotifications).toBeNull();
  });

  it("canViewAcademic=false also hides ALL academic metadata in the overview (M1)", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1", { canViewAcademic: false })]);
    const data = await getGuardianPortalData(ctx);
    const o = data.selected!.overview;
    expect(o.courseName).toBeNull();
    expect(o.currentLevelName).toBeNull();
    expect(o.classGroupName).toBeNull();
    expect(o.enrollmentStatus).toBeNull();
    expect(o.academicStatusLabel).toBeNull();
    expect(o.overallAverage).toBeNull();
    // Identity is still visible to a linked guardian.
    expect(o.studentName).toBeTruthy();
    expect(o.studentNumber).toBeTruthy();
    expect(o.studentStatus).toBe("ACTIVE");
  });

  it("canViewAcademic=false omits course/class from the student selector (M1)", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1", { canViewAcademic: false })]);
    h.findGuardianStudentEnrollmentSummaries.mockResolvedValue(
      new Map([["s1", { studentId: "s1", courseName: "Curso A", classGroupName: "Turma 1" }]])
    );
    const data = await getGuardianPortalData(ctx);
    expect(data.students[0].courseName).toBeNull();
    expect(data.students[0].classGroupName).toBeNull();
    expect(data.students[0].studentName).toBeTruthy();
    expect(data.students[0].status).toBe("ACTIVE");
  });
});

describe("getGuardianPortalData — dangling / disappeared student (M2)", () => {
  it("skips a student whose profile 404s and selects the next valid linked student", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1"), link("s2")]);
    h.findGuardianStudentEnrollmentSummaries.mockResolvedValue(new Map());
    h.getStudent360Core.mockImplementation(async (id: string) => {
      if (id === "s1") throw new NotFoundError("Aluno", "s1"); // disappeared mid-request
      return makeCore();
    });
    // No explicit selection → default is s1 (first link), which now 404s.
    const data = await getGuardianPortalData(ctx);
    expect(data.selectedStudentId).toBe("s2");
    expect(data.selected).not.toBeNull();
  });

  it("falls back to the blocked state when EVERY linked student has disappeared", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1"), link("s2")]);
    h.findGuardianStudentEnrollmentSummaries.mockResolvedValue(new Map());
    h.getStudent360Core.mockRejectedValue(new NotFoundError("Aluno", "x"));
    const data = await getGuardianPortalData(ctx);
    expect(data.selected).toBeNull();
    expect(data.students).toEqual([]);
  });

  it("never swallows a non-NotFound error (genuine fault propagates)", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1")]);
    h.getStudent360Core.mockRejectedValue(new Error("db down"));
    await expect(getGuardianPortalData(ctx)).rejects.toThrow("db down");
  });
});

describe("getGuardianPortalData — selected student validation", () => {
  it("ignores a forged studentId and falls back to the first linked student", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1")]);
    h.findGuardianLink.mockResolvedValue(null); // forged id is not a real link
    const data = await getGuardianPortalData(ctx, "forged-student-x");
    expect(data.selectedStudentId).toBe("s1");
    expect(h.getStudent360Core).toHaveBeenCalledWith("s1", "org-1");
    expect(h.getStudent360Core).not.toHaveBeenCalledWith("forged-student-x", "org-1");
  });

  it("selects a validly-requested linked student among several", async () => {
    h.findGuardianLinks.mockResolvedValue([link("s1"), link("s2")]);
    h.findGuardianStudentEnrollmentSummaries.mockResolvedValue(new Map());
    const data = await getGuardianPortalData(ctx, "s2");
    expect(data.selectedStudentId).toBe("s2");
    expect(h.getStudent360Core).toHaveBeenCalledWith("s2", "org-1");
  });
});
