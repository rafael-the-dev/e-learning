import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GuardianLinkRow } from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import type { StudentCandidacyRow } from "@/modules/student-examinations/repositories/student-exam.repository";

vi.mock("@/modules/guardian-portal/repositories/guardian-portal.repository", () => ({
  findGuardianLinks: vi.fn(),
  findGuardianLink: vi.fn(),
}));
vi.mock("@/modules/examinations/repositories/exam-candidate.repository", () => ({
  findExamCandidateById: vi.fn(),
}));
vi.mock("@/modules/student-examinations/repositories/student-exam.repository", () => ({
  listStudentCandidacies: vi.fn(),
  countPendingAppeals: vi.fn(),
  findStudentCandidacy: vi.fn(),
  findLatestAppealForResult: vi.fn(),
  listStudentHistory: vi.fn(),
  countStudentHistory: vi.fn(),
  listStudentHistoryFacets: vi.fn(),
  listStudentAppeals: vi.fn(),
}));

import {
  findGuardianLinks,
  findGuardianLink,
} from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import { findExamCandidateById } from "@/modules/examinations/repositories/exam-candidate.repository";
import {
  listStudentCandidacies,
  countPendingAppeals,
  findStudentCandidacy,
  findLatestAppealForResult,
  listStudentHistory,
  countStudentHistory,
  listStudentHistoryFacets,
  listStudentAppeals,
} from "@/modules/student-examinations/repositories/student-exam.repository";
import { guardianExaminationService } from "@/modules/guardian-examinations/services/guardian-examination.service";

const ORG = "org-1";
const GU = "guardian-user-1";
const NOW = new Date("2026-07-20T08:00:00.000Z");

function link(o: Partial<GuardianLinkRow> & { studentId: string }): GuardianLinkRow {
  return {
    linkId: `link-${o.studentId}`,
    relationshipType: "MOTHER",
    isPrimary: false,
    canViewAcademic: true,
    canViewAttendance: true,
    canViewFinance: false,
    canViewDocuments: true,
    canReceiveNotifications: true,
    student: { firstName: "Ana", lastName: "Silva", code: "A1", status: "ACTIVE" },
    ...o,
  } as GuardianLinkRow;
}

function cand(o: Partial<StudentCandidacyRow> & { startsAt: Date }): StudentCandidacyRow {
  const { startsAt, ...rest } = o;
  return {
    examCandidateId: "c1",
    examSessionId: "s1",
    candidateStatus: "REGISTERED",
    eligibilityStatus: "ELIGIBLE",
    eligibilitySnapshot: null,
    overridden: false,
    registeredAt: new Date("2026-06-01T00:00:00Z"),
    session: {
      title: "Exame",
      status: "SCHEDULED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
      instructions: null,
      roomName: "B2",
      subjectName: "Matemática",
      levelName: "Nível 1",
      courseName: "Ligeiros",
      periodName: "Época 1",
      academicYear: "2025/2026",
      term: "1",
    },
    attendanceStatus: null,
    result: null,
    ...rest,
  };
}

const publishedResult = {
  examResultId: "r1",
  status: "PUBLISHED",
  score: 15,
  maxScore: 20,
  normalizedScore: 75,
  resultCode: "SCORED",
  publishedAt: new Date("2026-07-10T00:00:00Z"),
  currentRevisionId: null,
};

beforeEach(() => vi.clearAllMocks());

describe("GuardianExaminationService.getOverview", () => {
  it("returns hasLinks=false with no students when the guardian has no links", async () => {
    vi.mocked(findGuardianLinks).mockResolvedValue([]);
    const o = await guardianExaminationService.getOverview(ORG, GU, NOW);
    expect(o.hasLinks).toBe(false);
    expect(o.students).toEqual([]);
  });

  it("withholds exam data when the link has canViewAcademic=false (never reads exams)", async () => {
    vi.mocked(findGuardianLinks).mockResolvedValue([link({ studentId: "stu-1", canViewAcademic: false })]);
    const o = await guardianExaminationService.getOverview(ORG, GU, NOW);
    expect(o.students[0].academicVisible).toBe(false);
    expect(o.students[0].nextExam).toBeNull();
    expect(o.students[0].latestResults).toEqual([]);
    expect(o.students[0].alerts[0]).toMatch(/sem visibilidade académica/i);
    // The exam read layer is never touched for a non-academic link.
    expect(listStudentCandidacies).not.toHaveBeenCalled();
    expect(countPendingAppeals).not.toHaveBeenCalled();
  });

  it("summarises exams per academic-visible student (next exam, this-week, published-only, appeals)", async () => {
    vi.mocked(findGuardianLinks).mockResolvedValue([link({ studentId: "stu-1", isPrimary: true })]);
    vi.mocked(countPendingAppeals).mockResolvedValue(1);
    vi.mocked(listStudentCandidacies).mockResolvedValue([
      cand({ examCandidateId: "c-soon", startsAt: new Date("2026-07-22T09:00:00Z") }), // this week
      cand({ examCandidateId: "c-far", startsAt: new Date("2026-08-30T09:00:00Z") }), // future, not this week
      cand({ examCandidateId: "c-pub", startsAt: new Date("2026-07-01T09:00:00Z"), result: { ...publishedResult } }),
      cand({ examCandidateId: "c-draft", startsAt: new Date("2026-07-02T09:00:00Z"), result: { ...publishedResult, examResultId: "r2", status: "DRAFT", publishedAt: null } }),
    ]);

    const o = await guardianExaminationService.getOverview(ORG, GU, NOW);
    const s = o.students[0];
    expect(s.academicVisible).toBe(true);
    expect(s.nextExam?.examCandidateId).toBe("c-soon");
    expect(s.examsThisWeek).toBe(1);
    expect(s.latestResults.map((r) => r.examResultId)).toEqual(["r1"]); // published only (draft masked)
    expect(s.pendingAppeals).toBe(1);
    expect(s.alerts.some((a) => a.includes("Próximo exame"))).toBe(true);
  });

  it("produces one summary per linked student (multi-student supervision)", async () => {
    vi.mocked(findGuardianLinks).mockResolvedValue([
      link({ studentId: "stu-1", isPrimary: true, student: { firstName: "Ana", lastName: "Silva", code: "A1", status: "ACTIVE" } }),
      link({ studentId: "stu-2", canViewAcademic: false, student: { firstName: "Rui", lastName: "Sá", code: "A2", status: "ACTIVE" } }),
    ]);
    vi.mocked(countPendingAppeals).mockResolvedValue(0);
    vi.mocked(listStudentCandidacies).mockResolvedValue([]);

    const o = await guardianExaminationService.getOverview(ORG, GU, NOW);
    expect(o.students).toHaveLength(2);
    expect(o.students[0].student.studentName).toBe("Ana Silva");
    expect(o.students[0].academicVisible).toBe(true);
    expect(o.students[1].student.studentName).toBe("Rui Sá");
    expect(o.students[1].academicVisible).toBe(false); // stu-2 link has canViewAcademic=false
  });
});

describe("GuardianExaminationService.getExamDetail — read-only, fail-closed, flag-gated", () => {
  const CID = "cand-1";
  const withCandidate = (studentId = "stu-1") =>
    vi.mocked(findExamCandidateById).mockResolvedValue({ studentId } as never);

  it("null when the candidacy does not exist / cross-org (org-scoped read)", async () => {
    vi.mocked(findExamCandidateById).mockResolvedValue(null);
    expect(await guardianExaminationService.getExamDetail(ORG, GU, CID)).toBeNull();
    expect(findGuardianLink).not.toHaveBeenCalled();
  });

  it("null when the guardian has no active link to that student (other guardian / other student / inactive link)", async () => {
    withCandidate("stu-other");
    vi.mocked(findGuardianLink).mockResolvedValue(null); // findGuardianLink filters org+guardianUserId+studentId+deletedAt
    expect(await guardianExaminationService.getExamDetail(ORG, GU, CID)).toBeNull();
    expect(findStudentCandidacy).not.toHaveBeenCalled();
  });

  it("null when the link has canViewAcademic=false (academic gate)", async () => {
    withCandidate();
    vi.mocked(findGuardianLink).mockResolvedValue(link({ studentId: "stu-1", canViewAcademic: false }));
    expect(await guardianExaminationService.getExamDetail(ORG, GU, CID)).toBeNull();
    expect(findStudentCandidacy).not.toHaveBeenCalled();
  });

  it("masks a non-published result and exposes NO admin/private fields", async () => {
    withCandidate();
    vi.mocked(findGuardianLink).mockResolvedValue(link({ studentId: "stu-1" }));
    vi.mocked(findStudentCandidacy).mockResolvedValue(
      cand({ startsAt: new Date("2026-07-01T09:00:00Z"), attendanceStatus: "PRESENT", result: { ...publishedResult, status: "DRAFT", publishedAt: null } })
    );
    const d = await guardianExaminationService.getExamDetail(ORG, GU, CID);
    expect(d?.result).toBeNull(); // draft masked
    expect(findLatestAppealForResult).not.toHaveBeenCalled();
    for (const k of ["markerId", "reviewedById", "approvedById", "publishedById", "decisionReason", "allowedActions", "canCreateAppeal"]) {
      expect(Object.keys(d as object)).not.toContain(k);
    }
  });

  it("hides the whole attendance section when canViewAttendance=false", async () => {
    withCandidate();
    vi.mocked(findGuardianLink).mockResolvedValue(link({ studentId: "stu-1", canViewAttendance: false }));
    vi.mocked(findStudentCandidacy).mockResolvedValue(
      cand({ startsAt: new Date("2026-07-01T09:00:00Z"), attendanceStatus: "PRESENT" })
    );
    const d = await guardianExaminationService.getExamDetail(ORG, GU, CID);
    expect(d?.attendanceVisible).toBe(false);
    expect(d?.attendanceStatus).toBeNull(); // withheld even though attendance was PRESENT
  });

  it("surfaces a published result + read-only appeal status (no private reason)", async () => {
    withCandidate();
    vi.mocked(findGuardianLink).mockResolvedValue(link({ studentId: "stu-1" }));
    vi.mocked(findStudentCandidacy).mockResolvedValue(
      cand({ startsAt: new Date("2026-07-01T09:00:00Z"), attendanceStatus: "PRESENT", result: { ...publishedResult } })
    );
    vi.mocked(findLatestAppealForResult).mockResolvedValue({
      appealId: "app-1", examResultId: "r1", subjectName: "Matemática", sessionDate: new Date(),
      reason: "PRIVATE student reason", status: "REJECTED", decision: "REJECTED",
      decidedAt: new Date("2026-07-15T00:00:00Z"), submittedAt: new Date("2026-07-12T00:00:00Z"),
    } as never);

    const d = await guardianExaminationService.getExamDetail(ORG, GU, CID);
    expect(d?.result?.normalizedScore).toBe(75);
    expect(d?.attendanceVisible).toBe(true);
    expect(d?.appeal?.status).toBe("REJECTED");
    expect(d?.appeal?.publicDecision).toBe("REJECTED");
    // The appeal DTO carries no reason / decisionReason.
    expect(Object.keys(d!.appeal as object)).not.toContain("reason");
    expect(Object.keys(d!.appeal as object)).not.toContain("decisionReason");
  });
});

describe("GuardianExaminationService — History (scoped, fail-closed, flag-gated)", () => {
  const STU = "stu-1";

  it("getHistoryStudentOptions returns only academic-visible linked students", async () => {
    vi.mocked(findGuardianLinks).mockResolvedValue([
      link({ studentId: "stu-1" }),
      link({ studentId: "stu-2", canViewAcademic: false }),
    ]);
    const opts = await guardianExaminationService.getHistoryStudentOptions(ORG, GU);
    expect(opts.map((s) => s.studentId)).toEqual(["stu-1"]); // stu-2 excluded
  });

  it("null when the selected student is not the guardian's / other-org / inactive link", async () => {
    vi.mocked(findGuardianLink).mockResolvedValue(null);
    expect(await guardianExaminationService.getHistory(ORG, GU, "not-mine", {})).toBeNull();
    expect(listStudentHistory).not.toHaveBeenCalled();
  });

  it("null when canViewAcademic=false (no silent fallback to another student)", async () => {
    vi.mocked(findGuardianLink).mockResolvedValue(link({ studentId: STU, canViewAcademic: false }));
    expect(await guardianExaminationService.getHistory(ORG, GU, STU, {})).toBeNull();
  });

  it("masks non-published, withholds attendance when canViewAttendance=false, and maps appeal status", async () => {
    vi.mocked(findGuardianLink).mockResolvedValue(link({ studentId: STU, canViewAttendance: false }));
    vi.mocked(countStudentHistory).mockResolvedValue(3);
    vi.mocked(listStudentHistoryFacets).mockResolvedValue({ years: [2026], subjects: [{ id: "sub-1", name: "Matemática" }] });
    vi.mocked(listStudentAppeals).mockResolvedValue([
      { appealId: "a1", examResultId: "r1", subjectName: "M", sessionDate: new Date(), reason: "x", status: "UNDER_REVIEW", decision: null, decidedAt: null, submittedAt: new Date() } as never,
    ]);
    vi.mocked(listStudentHistory).mockResolvedValue([
      cand({ examCandidateId: "c-pub", startsAt: new Date("2026-07-01T09:00:00Z"), attendanceStatus: "PRESENT", result: { ...publishedResult } }),
      cand({ examCandidateId: "c-draft", startsAt: new Date("2026-07-02T09:00:00Z"), attendanceStatus: "ABSENT", result: { ...publishedResult, examResultId: "r2", status: "DRAFT", publishedAt: null } }),
      cand({ examCandidateId: "c-none", startsAt: new Date("2026-07-03T09:00:00Z"), attendanceStatus: "ABSENT" }),
    ]);

    const h = await guardianExaminationService.getHistory(ORG, GU, STU, { page: 1 });
    const byId = Object.fromEntries(h!.items.map((i) => [i.examCandidateId, i]));
    expect(h!.attendanceVisible).toBe(false);
    expect(byId["c-pub"].attendanceStatus).toBeNull(); // withheld despite PRESENT
    expect(byId["c-pub"].result?.normalizedScore).toBe(75);
    expect(byId["c-pub"].appealStatus).toBe("UNDER_REVIEW"); // appeal on r1
    expect(byId["c-draft"].result).toBeNull(); // draft masked
    expect(byId["c-none"].result).toBeNull();
    expect(h!.facets.subjects).toEqual([{ id: "sub-1", name: "Matemática" }]);
    expect(h!.total).toBe(3);
  });

  it("paginates server-side and scopes facets to the selected student", async () => {
    vi.mocked(findGuardianLink).mockResolvedValue(link({ studentId: STU }));
    vi.mocked(listStudentHistory).mockResolvedValue([]);
    vi.mocked(countStudentHistory).mockResolvedValue(0);
    vi.mocked(listStudentHistoryFacets).mockResolvedValue({ years: [], subjects: [] });
    vi.mocked(listStudentAppeals).mockResolvedValue([]);

    const h = await guardianExaminationService.getHistory(ORG, GU, STU, { page: 2, pageSize: 10, subjectId: "sub-1" });
    expect(h!.page).toBe(2);
    expect(h!.pageSize).toBe(10);
    expect(vi.mocked(listStudentHistory)).toHaveBeenCalledWith(ORG, STU, expect.objectContaining({ skip: 10, take: 10, subjectId: "sub-1" }));
    expect(vi.mocked(listStudentHistoryFacets)).toHaveBeenCalledWith(ORG, STU); // facets scoped to the student, not the page
  });
});
