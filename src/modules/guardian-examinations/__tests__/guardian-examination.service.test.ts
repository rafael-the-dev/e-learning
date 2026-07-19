import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GuardianLinkRow } from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import type { StudentCandidacyRow } from "@/modules/student-examinations/repositories/student-exam.repository";

vi.mock("@/modules/guardian-portal/repositories/guardian-portal.repository", () => ({
  findGuardianLinks: vi.fn(),
}));
vi.mock("@/modules/student-examinations/repositories/student-exam.repository", () => ({
  listStudentCandidacies: vi.fn(),
  countPendingAppeals: vi.fn(),
}));

import { findGuardianLinks } from "@/modules/guardian-portal/repositories/guardian-portal.repository";
import {
  listStudentCandidacies,
  countPendingAppeals,
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
