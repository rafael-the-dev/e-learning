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
      { examCandidateId: "c1", studentName: "Ana Silva", studentNumber: "A1", candidateStatus: "REGISTERED", attendanceStatus: "PRESENT", resultStatus: "SUBMITTED", resultCode: "SCORED", normalizedScore: 80 },
      { examCandidateId: "c2", studentName: "Rui Sá", studentNumber: "A2", candidateStatus: "REGISTERED", attendanceStatus: null, resultStatus: null, resultCode: null, normalizedScore: null },
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
