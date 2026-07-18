import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  StudentAppealRow,
  StudentCandidacyRow,
  StudentResultDetailRow,
} from "@/modules/student-examinations/repositories/student-exam.repository";

// Mock the repository so the SERVICE's mapping / masking / capability logic is
// tested in isolation. Every repo read is studentId-scoped (a where-clause
// guarantee); the null returns below model "not the student's own / not published".
vi.mock("@/modules/student-examinations/repositories/student-exam.repository", () => ({
  listStudentCandidacies: vi.fn(),
  findStudentCandidacy: vi.fn(),
  countPendingAppeals: vi.fn(),
  findStudentResultDetail: vi.fn(),
  findStudentAppeal: vi.fn(),
  findLatestAppealForResult: vi.fn(),
  hasActiveAppealForResult: vi.fn(),
  listStudentAppeals: vi.fn(),
  listStudentHistory: vi.fn(),
  countStudentHistory: vi.fn(),
}));

import {
  findStudentResultDetail,
  findStudentAppeal,
  findLatestAppealForResult,
  hasActiveAppealForResult,
  listStudentAppeals,
  listStudentHistory,
  countStudentHistory,
} from "@/modules/student-examinations/repositories/student-exam.repository";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";

const ORG = "org-1";
const STU = "stu-1";

function resultRow(overrides: Partial<StudentResultDetailRow> = {}): StudentResultDetailRow {
  return {
    examResultId: "res-1",
    examCandidateId: "cand-1",
    examSessionId: "sess-1",
    subjectName: "Matemática",
    courseName: "Ligeiros",
    levelName: "Nível 1",
    sessionDate: new Date("2026-07-01T09:00:00Z"),
    publishedAt: new Date("2026-07-05T00:00:00Z"),
    score: 15,
    maxScore: 20,
    normalizedScore: 75,
    resultCode: "SCORED",
    ...overrides,
  };
}

function appealRow(overrides: Partial<StudentAppealRow> = {}): StudentAppealRow {
  return {
    appealId: "app-1",
    examResultId: "res-1",
    subjectName: "Matemática",
    sessionDate: new Date("2026-07-01T09:00:00Z"),
    reason: "Discordo da pontuação da questão 3.",
    status: "PENDING",
    decision: null,
    decidedAt: null,
    submittedAt: new Date("2026-07-06T00:00:00Z"),
    ...overrides,
  };
}

function candidacyRow(overrides: Partial<StudentCandidacyRow> & { startsAt?: Date } = {}): StudentCandidacyRow {
  const { startsAt = new Date("2026-07-01T09:00:00Z"), ...rest } = overrides;
  return {
    examCandidateId: "cand-1",
    examSessionId: "sess-1",
    candidateStatus: "REGISTERED",
    eligibilityStatus: "ELIGIBLE",
    eligibilitySnapshot: null,
    overridden: false,
    registeredAt: new Date("2026-06-01T00:00:00Z"),
    session: {
      title: "Exame",
      status: "COMPLETED",
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
  publishedAt: new Date("2026-07-05T00:00:00Z"),
  currentRevisionId: null,
};

describe("Phase 2 — Result Details (ownership, masking, capability, privacy)", () => {
  beforeEach(() => {
    vi.mocked(findLatestAppealForResult).mockResolvedValue(null);
    vi.mocked(hasActiveAppealForResult).mockResolvedValue(false);
  });

  it("returns null when the result is not the student's own / not published", async () => {
    vi.mocked(findStudentResultDetail).mockResolvedValue(null);
    const d = await studentExaminationService.getResultDetail(ORG, STU, "not-mine");
    expect(d).toBeNull();
  });

  it("surfaces an owned published result with correct percentage and no private fields", async () => {
    vi.mocked(findStudentResultDetail).mockResolvedValue(resultRow());
    const d = await studentExaminationService.getResultDetail(ORG, STU, "res-1");
    expect(d?.normalizedScore).toBe(75);
    expect(d?.score).toBe(15);
    expect(d?.canCreateAppeal).toBe(true);
    expect(d?.appeal).toBeNull();
    expect(d?.publicComment).toBeNull();
    // Privacy: no admin internals leak into the DTO.
    expect(Object.keys(d as object)).not.toContain("remarks");
    expect(Object.keys(d as object)).not.toContain("markerId");
  });

  it("shows the related appeal and blocks a new one while an appeal is active", async () => {
    vi.mocked(findStudentResultDetail).mockResolvedValue(resultRow());
    vi.mocked(findLatestAppealForResult).mockResolvedValue(appealRow({ status: "PENDING" }));
    vi.mocked(hasActiveAppealForResult).mockResolvedValue(true);
    const d = await studentExaminationService.getResultDetail(ORG, STU, "res-1");
    expect(d?.appeal?.status).toBe("PENDING");
    expect(d?.appeal?.canWithdraw).toBe(true);
    expect(d?.canCreateAppeal).toBe(false);
    expect(d?.createAppealBlockedReason).toBeTruthy();
  });
});

describe("Phase 2 — Appeals (ownership, capability, privacy)", () => {
  it("returns null when the appeal is not the student's own (IDOR guard)", async () => {
    vi.mocked(findStudentAppeal).mockResolvedValue(null);
    const d = await studentExaminationService.getAppealDetail(ORG, STU, "not-mine");
    expect(d).toBeNull();
  });

  it("allows withdraw only while PENDING", async () => {
    vi.mocked(findStudentAppeal).mockResolvedValue(appealRow({ status: "PENDING" }));
    const pending = await studentExaminationService.getAppealDetail(ORG, STU, "app-1");
    expect(pending?.canWithdraw).toBe(true);
    expect(pending?.withdrawBlockedReason).toBeNull();

    vi.mocked(findStudentAppeal).mockResolvedValue(appealRow({ status: "UNDER_REVIEW" }));
    const review = await studentExaminationService.getAppealDetail(ORG, STU, "app-1");
    expect(review?.canWithdraw).toBe(false);
    expect(review?.withdrawBlockedReason).toContain("análise");

    vi.mocked(findStudentAppeal).mockResolvedValue(
      appealRow({ status: "APPROVED", decision: "APPROVED", decidedAt: new Date() })
    );
    const decided = await studentExaminationService.getAppealDetail(ORG, STU, "app-1");
    expect(decided?.canWithdraw).toBe(false);
    expect(decided?.withdrawBlockedReason).toContain("decidido");
  });

  it("appeal detail exposes the public decision but never the private decisionReason", async () => {
    vi.mocked(findStudentAppeal).mockResolvedValue(
      appealRow({ status: "REJECTED", decision: "REJECTED", decidedAt: new Date() })
    );
    const d = await studentExaminationService.getAppealDetail(ORG, STU, "app-1");
    expect(d?.publicDecision).toBe("REJECTED");
    expect(Object.keys(d as object)).not.toContain("decisionReason");
    expect(Object.keys(d as object)).not.toContain("decidedById");
  });

  it("lists appeals with the public decision only", async () => {
    vi.mocked(listStudentAppeals).mockResolvedValue([
      appealRow({ appealId: "a1", status: "REJECTED", decision: "REJECTED" }),
      appealRow({ appealId: "a2", status: "PENDING" }),
    ]);
    const list = await studentExaminationService.listAppeals(ORG, STU);
    expect(list.map((a) => a.appealId)).toEqual(["a1", "a2"]);
    expect(list[0].publicDecision).toBe("REJECTED");
    expect(list[1].canWithdraw).toBe(true);
  });
});

describe("Phase 2 — History (candidacy-based, masking, pagination)", () => {
  it("includes a candidacy with no published result and masks a non-published one", async () => {
    vi.mocked(listStudentHistory).mockResolvedValue([
      candidacyRow({ examCandidateId: "c-noresult", result: null }),
      candidacyRow({ examCandidateId: "c-draft", result: { ...publishedResult, status: "DRAFT", publishedAt: null } }),
      candidacyRow({ examCandidateId: "c-pub", result: { ...publishedResult } }),
    ]);
    vi.mocked(countStudentHistory).mockResolvedValue(3);
    const page = await studentExaminationService.listHistory(ORG, STU, {});
    const byId = Object.fromEntries(page.items.map((i) => [i.examCandidateId, i]));
    expect(byId["c-noresult"].result).toBeNull();
    expect(byId["c-draft"].result).toBeNull(); // masked — not published
    expect(byId["c-pub"].result?.normalizedScore).toBe(75);
  });

  it("includes an absence (attendanceStatus preserved)", async () => {
    vi.mocked(listStudentHistory).mockResolvedValue([
      candidacyRow({ examCandidateId: "c-absent", attendanceStatus: "ABSENT" }),
    ]);
    vi.mocked(countStudentHistory).mockResolvedValue(1);
    const page = await studentExaminationService.listHistory(ORG, STU, {});
    expect(page.items[0].attendanceStatus).toBe("ABSENT");
  });

  it("returns the requested page window and total", async () => {
    vi.mocked(listStudentHistory).mockResolvedValue([candidacyRow({})]);
    vi.mocked(countStudentHistory).mockResolvedValue(37);
    const page = await studentExaminationService.listHistory(ORG, STU, { page: 2, pageSize: 10 });
    expect(page.page).toBe(2);
    expect(page.pageSize).toBe(10);
    expect(page.total).toBe(37);
    // The repo received the right skip/take.
    expect(vi.mocked(listStudentHistory)).toHaveBeenCalledWith(
      ORG,
      STU,
      expect.objectContaining({ skip: 10, take: 10 })
    );
  });
});
