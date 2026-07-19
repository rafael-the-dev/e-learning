import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  TeacherSessionRow,
  TeacherCandidateRow,
} from "@/modules/teacher-examinations/repositories/teacher-exam.repository";

vi.mock("@/modules/teacher-examinations/repositories/teacher-exam.repository", () => ({
  listAssignedSessions: vi.fn(),
  countAssignedSessions: vi.fn(),
  findAssignedSession: vi.fn(),
  loadSessionsProgress: vi.fn(),
  listSessionCandidates: vi.fn(),
  listAssignedSessionFacets: vi.fn(),
}));

import {
  listAssignedSessions,
  countAssignedSessions,
  findAssignedSession,
  loadSessionsProgress,
  listSessionCandidates,
} from "@/modules/teacher-examinations/repositories/teacher-exam.repository";
import {
  teacherExaminationService,
  computeTeacherCapabilities,
} from "@/modules/teacher-examinations/services/teacher-examination.service";

const ORG = "org-1";
const T = "teacher-1";

function row(overrides: Partial<TeacherSessionRow> = {}): TeacherSessionRow {
  return {
    examSessionId: "sess-1",
    title: "Exame",
    sessionStatus: "IN_PROGRESS",
    startsAt: new Date("2026-07-20T09:00:00Z"),
    endsAt: new Date("2026-07-20T11:00:00Z"),
    instructions: null,
    roomName: "B2",
    subjectName: "Matemática",
    levelName: "Nível 1",
    courseName: "Ligeiros",
    periodName: "Época 1",
    role: "CHIEF",
    ...overrides,
  };
}
const progress = (o: Partial<{ candidateCount: number; attendanceMarked: number; resultsDraft: number; resultsSubmitted: number }> = {}) => ({
  examSessionId: "sess-1",
  candidateCount: 10,
  attendanceMarked: 0,
  resultsDraft: 0,
  resultsSubmitted: 0,
  ...o,
});

function cand(o: Partial<TeacherCandidateRow> & { examCandidateId: string }): TeacherCandidateRow {
  return {
    studentName: "Aluno",
    studentNumber: "1",
    candidateStatus: "REGISTERED",
    attendanceStatus: null,
    resultId: null,
    resultStatus: null,
    resultCode: null,
    score: null,
    maxScore: null,
    normalizedScore: null,
    ...o,
  };
}

describe("computeTeacherCapabilities — role × session-state matrix (ADR-017 lockstep)", () => {
  it("CHIEF: attendance in LOCKED/IN_PROGRESS, results in IN_PROGRESS/COMPLETED, submit only COMPLETED", () => {
    const inProg = computeTeacherCapabilities("CHIEF", "IN_PROGRESS");
    expect(inProg).toMatchObject({ canMarkAttendance: true, canCorrectAttendance: true, canEnterResults: true, canUpdateResults: true, canSubmitResults: false });
    const done = computeTeacherCapabilities("CHIEF", "COMPLETED");
    expect(done).toMatchObject({ canMarkAttendance: false, canCorrectAttendance: true, canEnterResults: true, canSubmitResults: true });
  });

  it("INVIGILATOR: attendance yes, results NO", () => {
    const c = computeTeacherCapabilities("INVIGILATOR", "IN_PROGRESS");
    expect(c.canMarkAttendance).toBe(true);
    expect(c.canCorrectAttendance).toBe(true);
    expect(c.canEnterResults).toBe(false);
    expect(c.canSubmitResults).toBe(false);
    expect(c.resultsBlockReason).toMatch(/papel/i);
    expect(c.attendanceBlockReason).toBeNull();
  });

  it("MARKER: attendance + results", () => {
    const c = computeTeacherCapabilities("MARKER", "COMPLETED");
    expect(c.canCorrectAttendance).toBe(true);
    expect(c.canEnterResults).toBe(true);
    expect(c.canSubmitResults).toBe(true);
  });

  it("OBSERVER: writes nothing (but can still READ)", () => {
    const c = computeTeacherCapabilities("OBSERVER", "IN_PROGRESS");
    expect(c).toMatchObject({
      canMarkAttendance: false,
      canCorrectAttendance: false,
      canEnterResults: false,
      canUpdateResults: false,
      canSubmitResults: false,
    });
    expect(c.attendanceBlockReason).toMatch(/papel/i);
    expect(c.resultsBlockReason).toMatch(/papel/i);
  });

  it("state gate: CHIEF on a pre-sitting session (SCHEDULED) cannot write yet", () => {
    const c = computeTeacherCapabilities("CHIEF", "SCHEDULED");
    expect(c.canMarkAttendance).toBe(false);
    expect(c.canEnterResults).toBe(false);
    expect(c.attendanceBlockReason).toMatch(/não está aberta/i);
    expect(c.resultsBlockReason).toMatch(/fase de resultados/i);
  });
});

describe("TeacherExaminationService — detail (fail-closed, no admin fields)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the session is not the teacher's assignment (fail-closed)", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(null);
    const d = await teacherExaminationService.getSessionDetail(ORG, T, "not-mine");
    expect(d).toBeNull();
  });

  it("maps role + capabilities + progress and exposes NO admin fields", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(row({ role: "MARKER", sessionStatus: "COMPLETED" }));
    const candidates: TeacherCandidateRow[] = [
      cand({ examCandidateId: "c1", studentName: "Ana Silva", studentNumber: "A1", attendanceStatus: "PRESENT", resultId: "r1", resultStatus: "SUBMITTED", resultCode: "SCORED", score: 16, maxScore: 20, normalizedScore: 80 }),
      cand({ examCandidateId: "c2", studentName: "Rui Sá", studentNumber: "A2" }),
    ];
    vi.mocked(listSessionCandidates).mockResolvedValue(candidates);

    const d = await teacherExaminationService.getSessionDetail(ORG, T, "sess-1");
    expect(d?.role).toBe("MARKER");
    expect(d?.capabilities.canSubmitResults).toBe(true);
    expect(d?.progress).toMatchObject({ candidateCount: 2, attendanceMarked: 1, resultsSubmitted: 1 });
    expect(d?.candidates).toHaveLength(2);
    // No admin internals leak.
    for (const k of ["allowedActions", "publication", "integration", "invigilators", "markerId", "reviewedById"]) {
      expect(Object.keys(d as object)).not.toContain(k);
    }
  });
});

describe("TeacherExaminationService — list mapping + nextAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes candidateCount/attendance/results and a nextAction hint", async () => {
    vi.mocked(listAssignedSessions).mockResolvedValue([row({ role: "CHIEF", sessionStatus: "IN_PROGRESS" })]);
    vi.mocked(countAssignedSessions).mockResolvedValue(1);
    vi.mocked(loadSessionsProgress).mockResolvedValue(
      new Map([["sess-1", progress({ candidateCount: 10, attendanceMarked: 3 })]])
    );
    const page = await teacherExaminationService.listSessions(ORG, T, {});
    expect(page.items[0].role).toBe("CHIEF");
    expect(page.items[0].candidateCount).toBe(10);
    expect(page.items[0].nextAction).toBe("Marcar presença"); // attendance incomplete
  });

  it("an OBSERVER's session still appears (read), with no nextAction", async () => {
    vi.mocked(listAssignedSessions).mockResolvedValue([row({ role: "OBSERVER" })]);
    vi.mocked(countAssignedSessions).mockResolvedValue(1);
    vi.mocked(loadSessionsProgress).mockResolvedValue(new Map([["sess-1", progress()]]));
    const page = await teacherExaminationService.listSessions(ORG, T, {});
    expect(page.items).toHaveLength(1);
    expect(page.items[0].role).toBe("OBSERVER");
    expect(page.items[0].nextAction).toBeNull();
  });
});

describe("TeacherExaminationService — overview counts only assigned sessions", () => {
  it("derives today / next / pending counts from the assigned set", async () => {
    const now = new Date("2026-07-20T08:00:00Z");
    vi.mocked(listAssignedSessions).mockResolvedValue([
      row({ examSessionId: "s-today", role: "CHIEF", sessionStatus: "IN_PROGRESS", startsAt: new Date("2026-07-20T09:00:00Z") }),
      row({ examSessionId: "s-future", role: "MARKER", sessionStatus: "SCHEDULED", startsAt: new Date("2026-07-25T09:00:00Z") }),
    ]);
    vi.mocked(loadSessionsProgress).mockResolvedValue(
      new Map([
        ["s-today", { examSessionId: "s-today", candidateCount: 10, attendanceMarked: 2, resultsDraft: 0, resultsSubmitted: 0 }],
        ["s-future", { examSessionId: "s-future", candidateCount: 0, attendanceMarked: 0, resultsDraft: 0, resultsSubmitted: 0 }],
      ])
    );
    const o = await teacherExaminationService.getOverview(ORG, T, now);
    expect(o.todayCount).toBe(1);
    expect(o.nextSession?.examSessionId).toBe("s-today");
    expect(o.attendancePendingCount).toBe(1); // s-today: CHIEF, IN_PROGRESS, attendance incomplete
  });
});

describe("Sprint 2 — canBulkMarkAttendance (markable AND pending exist)", () => {
  it("true only when the teacher can mark AND there is something pending", () => {
    expect(computeTeacherCapabilities("CHIEF", "IN_PROGRESS", { pendingAttendance: 3 }).canBulkMarkAttendance).toBe(true);
    expect(computeTeacherCapabilities("CHIEF", "IN_PROGRESS", { pendingAttendance: 0 }).canBulkMarkAttendance).toBe(false); // nothing pending
    expect(computeTeacherCapabilities("OBSERVER", "IN_PROGRESS", { pendingAttendance: 5 }).canBulkMarkAttendance).toBe(false); // can't mark
    expect(computeTeacherCapabilities("CHIEF", "COMPLETED", { pendingAttendance: 5 }).canBulkMarkAttendance).toBe(false); // mark closed
  });
});

describe("Sprint 2 — getSessionAttendanceView (fail-closed roster for revalidation)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the teacher is not assigned to the session", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(null);
    const v = await teacherExaminationService.getSessionAttendanceView(ORG, T, "not-mine");
    expect(v).toBeNull();
  });

  it("returns roster + progress + capabilities, with bulk enabled when pending exist", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(row({ role: "CHIEF", sessionStatus: "IN_PROGRESS" }));
    const candidates: TeacherCandidateRow[] = [
      cand({ examCandidateId: "c1", studentName: "A", attendanceStatus: "PRESENT" }),
      cand({ examCandidateId: "c2", studentName: "B" }),
    ];
    vi.mocked(listSessionCandidates).mockResolvedValue(candidates);

    const v = await teacherExaminationService.getSessionAttendanceView(ORG, T, "sess-1");
    expect(v?.progress).toMatchObject({ candidateCount: 2, attendanceMarked: 1 });
    expect(v?.capabilities.canMarkAttendance).toBe(true);
    expect(v?.capabilities.canBulkMarkAttendance).toBe(true); // 1 pending
    expect(v?.candidates).toHaveLength(2);
  });
});

describe("Sprint 3 — results view (capabilities matrix + fail-closed + no admin fields)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when the teacher is not assigned (fail-closed)", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(null);
    expect(await teacherExaminationService.getSessionResultsView(ORG, T, "x")).toBeNull();
  });

  it("MARKER can create for a present candidate; a candidate without attendance cannot", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(row({ role: "MARKER", sessionStatus: "IN_PROGRESS" }));
    vi.mocked(listSessionCandidates).mockResolvedValue([
      cand({ examCandidateId: "c1", attendanceStatus: "PRESENT" }),
      cand({ examCandidateId: "c2", attendanceStatus: null }),
    ]);
    const v = await teacherExaminationService.getSessionResultsView(ORG, T, "sess-1");
    const c1 = v!.rows.find((r) => r.examCandidateId === "c1")!;
    const c2 = v!.rows.find((r) => r.examCandidateId === "c2")!;
    expect(c1.expectedResultCode).toBe("SCORED");
    expect(c1.capabilities.canCreateResult).toBe(true);
    expect(c2.capabilities.canCreateResult).toBe(false);
    expect(c2.capabilities.createBlockReason).toMatch(/presença/i);
    expect(v!.capabilities.canBulkEnterResults).toBe(true); // c1 eligible
  });

  it("INVIGILATOR cannot create results (role gate)", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(row({ role: "INVIGILATOR", sessionStatus: "IN_PROGRESS" }));
    vi.mocked(listSessionCandidates).mockResolvedValue([cand({ examCandidateId: "c1", attendanceStatus: "PRESENT" })]);
    const v = await teacherExaminationService.getSessionResultsView(ORG, T, "sess-1");
    expect(v!.rows[0].capabilities.canCreateResult).toBe(false);
    expect(v!.rows[0].capabilities.createBlockReason).toMatch(/papel/i);
  });

  it("DRAFT updatable; submit only when COMPLETED; SUBMITTED is read-only", async () => {
    const draftCand = cand({ examCandidateId: "c1", attendanceStatus: "PRESENT", resultId: "r1", resultStatus: "DRAFT", resultCode: "SCORED", score: 12, maxScore: 20, normalizedScore: 60 });

    vi.mocked(findAssignedSession).mockResolvedValue(row({ role: "MARKER", sessionStatus: "IN_PROGRESS" }));
    vi.mocked(listSessionCandidates).mockResolvedValue([draftCand]);
    let v = await teacherExaminationService.getSessionResultsView(ORG, T, "sess-1");
    expect(v!.rows[0].capabilities.canUpdateDraft).toBe(true);
    expect(v!.rows[0].capabilities.canSubmitResult).toBe(false); // not completed
    expect(v!.capabilities.canBulkSubmitResults).toBe(false);

    vi.mocked(findAssignedSession).mockResolvedValue(row({ role: "MARKER", sessionStatus: "COMPLETED" }));
    v = await teacherExaminationService.getSessionResultsView(ORG, T, "sess-1");
    expect(v!.rows[0].capabilities.canSubmitResult).toBe(true);
    expect(v!.capabilities.canBulkSubmitResults).toBe(true);

    vi.mocked(listSessionCandidates).mockResolvedValue([{ ...draftCand, resultStatus: "SUBMITTED" }]);
    v = await teacherExaminationService.getSessionResultsView(ORG, T, "sess-1");
    expect(v!.rows[0].capabilities.canUpdateDraft).toBe(false);
    expect(v!.rows[0].capabilities.canSubmitResult).toBe(false);
    expect(v!.rows[0].capabilities.submitBlockReason).toMatch(/rascunho/i);
  });

  it("result DTO exposes no admin/private fields", async () => {
    vi.mocked(findAssignedSession).mockResolvedValue(row({ role: "MARKER", sessionStatus: "IN_PROGRESS" }));
    vi.mocked(listSessionCandidates).mockResolvedValue([
      cand({ examCandidateId: "c1", attendanceStatus: "PRESENT", resultId: "r1", resultStatus: "DRAFT" }),
    ]);
    const v = await teacherExaminationService.getSessionResultsView(ORG, T, "sess-1");
    const resultKeys = Object.keys(v!.rows[0].result as object);
    for (const k of ["markerId", "reviewedById", "approvedById", "publishedAt", "remarks", "resultChecksum"]) {
      expect(resultKeys).not.toContain(k);
    }
  });
});
