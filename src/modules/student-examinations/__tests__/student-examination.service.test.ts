import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StudentCandidacyRow } from "@/modules/student-examinations/repositories/student-exam.repository";

// Mock the repository so we test the SERVICE's mapping / masking / KPI logic in
// isolation (the repository's studentId scoping is a where-clause guarantee).
vi.mock("@/modules/student-examinations/repositories/student-exam.repository", () => ({
  listStudentCandidacies: vi.fn(),
  findStudentCandidacy: vi.fn(),
  countPendingAppeals: vi.fn(),
}));

import {
  listStudentCandidacies,
  findStudentCandidacy,
  countPendingAppeals,
} from "@/modules/student-examinations/repositories/student-exam.repository";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";

const NOW = new Date("2026-07-15T09:00:00.000Z");
const ORG = "org-1";
const STU = "stu-1";

function row(overrides: Partial<StudentCandidacyRow> & { startsAt: Date }): StudentCandidacyRow {
  const { startsAt, ...rest } = overrides;
  return {
    examCandidateId: "cand-x",
    examSessionId: "sess-x",
    candidateStatus: "REGISTERED",
    eligibilityStatus: "ELIGIBLE",
    eligibilitySnapshot: null,
    overridden: false,
    registeredAt: new Date("2026-06-01T00:00:00.000Z"),
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
  examResultId: "res-1",
  status: "PUBLISHED",
  score: 15,
  maxScore: 20,
  normalizedScore: 75,
  resultCode: "SCORED",
  publishedAt: new Date("2026-07-10T00:00:00.000Z"),
  currentRevisionId: null,
};
const draftResult = { ...publishedResult, examResultId: "res-2", status: "DRAFT", publishedAt: null };

beforeEach(() => {
  vi.mocked(countPendingAppeals).mockResolvedValue(2);
});

describe("StudentExaminationService — overview KPIs", () => {
  it("computes nextExam, examsThisWeek, pending publication and appeals", async () => {
    vi.mocked(listStudentCandidacies).mockResolvedValue([
      row({ examCandidateId: "c-soon", startsAt: new Date("2026-07-18T09:00:00Z") }), // this week
      row({ examCandidateId: "c-far", startsAt: new Date("2026-08-30T09:00:00Z") }), // future, not this week
      row({ examCandidateId: "c-pub", startsAt: new Date("2026-07-01T09:00:00Z"), result: { ...publishedResult } }),
      row({ examCandidateId: "c-pend", startsAt: new Date("2026-07-02T09:00:00Z"), result: { ...draftResult } }),
      row({ examCandidateId: "c-wd", startsAt: new Date("2026-07-03T09:00:00Z"), candidateStatus: "WITHDRAWN" }),
    ]);

    const o = await studentExaminationService.getOverview(ORG, STU, NOW);

    expect(o.nextExam?.examCandidateId).toBe("c-soon");
    expect(o.examsThisWeek).toBe(1);
    // Past, active, not published: only c-pend (c-pub is published; c-wd is withdrawn).
    expect(o.resultsPendingPublication).toBe(1);
    expect(o.pendingAppeals).toBe(2);
    expect(o.latestResults.map((r) => r.examResultId)).toEqual(["res-1"]);
    expect(o.alerts.some((a) => a.includes("Próximo exame"))).toBe(true);
  });
});

describe("StudentExaminationService — published-only masking", () => {
  it("never surfaces a non-published result", async () => {
    vi.mocked(listStudentCandidacies).mockResolvedValue([
      row({ examCandidateId: "c-draft", startsAt: new Date("2026-07-02T09:00:00Z"), result: { ...draftResult } }),
      row({ examCandidateId: "c-pub", startsAt: new Date("2026-07-01T09:00:00Z"), result: { ...publishedResult } }),
    ]);

    const results = await studentExaminationService.listResults(ORG, STU);
    expect(results).toHaveLength(1);
    expect(results[0].examResultId).toBe("res-1");
  });

  it("marks hasPublishedResult false for a drafted result", async () => {
    vi.mocked(listStudentCandidacies).mockResolvedValue([
      row({ examCandidateId: "c-draft", startsAt: new Date("2026-09-02T09:00:00Z"), result: { ...draftResult } }),
    ]);
    const up = await studentExaminationService.listUpcoming(ORG, STU, NOW);
    expect(up[0].hasPublishedResult).toBe(false);
  });
});

describe("StudentExaminationService — upcoming filtering", () => {
  it("excludes past, cancelled and withdrawn sittings; sorts ascending", async () => {
    vi.mocked(listStudentCandidacies).mockResolvedValue([
      row({ examCandidateId: "c-far", startsAt: new Date("2026-08-30T09:00:00Z") }),
      row({ examCandidateId: "c-soon", startsAt: new Date("2026-07-18T09:00:00Z") }),
      row({ examCandidateId: "c-past", startsAt: new Date("2026-07-01T09:00:00Z") }),
      row({ examCandidateId: "c-cancelled", startsAt: new Date("2026-07-20T09:00:00Z"), session: { ...row({ startsAt: new Date("2026-07-20T09:00:00Z") }).session, status: "CANCELLED" } }),
      row({ examCandidateId: "c-wd", startsAt: new Date("2026-07-25T09:00:00Z"), candidateStatus: "WITHDRAWN" }),
    ]);
    const up = await studentExaminationService.listUpcoming(ORG, STU, NOW);
    expect(up.map((u) => u.examCandidateId)).toEqual(["c-soon", "c-far"]);
  });
});

describe("StudentExaminationService — detail, IDOR and eligibility", () => {
  it("returns null when the candidacy is not the student's own (IDOR guard)", async () => {
    vi.mocked(findStudentCandidacy).mockResolvedValue(null);
    const d = await studentExaminationService.getExamDetail(ORG, STU, "not-mine", NOW);
    expect(d).toBeNull();
  });

  it("surfaces the published result and a complete timeline", async () => {
    vi.mocked(findStudentCandidacy).mockResolvedValue(
      row({
        examCandidateId: "c-pub",
        startsAt: new Date("2026-07-01T09:00:00Z"),
        attendanceStatus: "PRESENT",
        result: { ...publishedResult },
      })
    );
    const d = await studentExaminationService.getExamDetail(ORG, STU, "c-pub", NOW);
    expect(d?.result?.normalizedScore).toBe(75);
    expect(d?.timeline).toEqual({ registered: true, eligible: true, sat: true, resultPublished: true });
    expect(d?.durationMinutes).toBe(120);
  });

  it("parses eligibility blockers only for an INELIGIBLE candidacy", async () => {
    vi.mocked(findStudentCandidacy).mockResolvedValue(
      row({
        examCandidateId: "c-inelig",
        startsAt: new Date("2026-07-20T09:00:00Z"),
        eligibilityStatus: "INELIGIBLE",
        eligibilitySnapshot: JSON.stringify({ evaluated: { blockingReasons: ["ATTENDANCE_BELOW_REQUIRED"] } }),
      })
    );
    const d = await studentExaminationService.getExamDetail(ORG, STU, "c-inelig", NOW);
    expect(d?.eligibility.eligible).toBe(false);
    expect(d?.eligibility.blockers).toEqual(["ATTENDANCE_BELOW_REQUIRED"]);
  });

  it("does not surface a non-published result in the detail", async () => {
    vi.mocked(findStudentCandidacy).mockResolvedValue(
      row({ examCandidateId: "c-draft", startsAt: new Date("2026-07-01T09:00:00Z"), result: { ...draftResult } })
    );
    const d = await studentExaminationService.getExamDetail(ORG, STU, "c-draft", NOW);
    expect(d?.result).toBeNull();
  });
});
