import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 6 EXAM-ATTENDANCE COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives mark / correct / bulk-mark against the rollback-capable in-memory fake DB.
// Exam attendance is an Examination Engine fact, SEPARATE from the class Attendance
// Engine: these tests prove attendance rows are recorded/corrected with an
// ExamEvent + AuditLog written INSIDE the command tx, that ExamCandidate.status is
// NEVER mutated (even for DISQUALIFIED attendance) and NO ExamResult is created.
// `@/server/db` (→ fake) and `@/server/auth/rbac` (allow/deny + recorded perms) are
// the only mocks — attendance runs no eligibility engine.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true, checked: [] as string[] }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({
    can: (perm: string) => {
      authState.checked.push(perm);
      return authState.allow;
    },
  }),
}));

import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  BulkMarkExamAttendanceCommand,
  CorrectExamCandidateAttendanceCommand,
  MarkExamCandidateAttendanceCommand,
} from "../attendance.commands";
import type { BulkMarkExamAttendanceInput } from "@/modules/examinations/schemas/attendance.schema";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const otherCtx: ServiceContext = { userId: "u-x", organizationId: OTHER_ORG };

const store = (name: string) => h.db[name].__store;
const events = () => store("examEvent");
const audits = () => store("auditLog");
const eventsOf = (type: string) => events().filter((e) => (e as { eventType: string }).eventType === type);
const auditFor = (action: string) => audits().find((a) => (a as { action: string }).action === action);
const parseNew = (action: string) =>
  JSON.parse((auditFor(action) as { newValues: string }).newValues) as Record<string, unknown>;
const parseOld = (action: string) =>
  JSON.parse((auditFor(action) as { oldValues: string }).oldValues) as Record<string, unknown>;

const S_START = new Date("2026-06-10T09:00:00.000Z");
const S_END = new Date("2026-06-10T12:00:00.000Z");
const CHECK_IN = new Date("2026-06-10T09:05:00.000Z");

function seedSession(over: Record<string, unknown> = {}): void {
  seed(h.db, "examSession", {
    id: "sess-1", organizationId: ORG, periodId: "per-1", branchId: null, courseId: null,
    courseLevelId: null, levelSubjectId: "ls-1", roomId: null, title: "Exame",
    status: "IN_PROGRESS", startsAt: S_START, endsAt: S_END, capacity: 20, instructions: null,
    lockedAt: null, startedAt: null, completedAt: null, publishedAt: null, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, publishedById: null, cancelledById: null,
    deletedAt: null, ...over,
  });
}

function seedCandidate(over: Record<string, unknown> = {}): void {
  seed(h.db, "examCandidate", {
    id: "cand-1", organizationId: ORG, examSessionId: "sess-1", examAttemptId: "att-0",
    studentId: "stu-1", enrollmentId: "enr-1", eligibilityStatus: "ELIGIBLE", status: "REGISTERED",
    assignedSeat: null, registeredAt: S_START, registeredById: "u-0", withdrawnAt: null, withdrawnById: null,
    disqualifiedAt: null, disqualifiedById: null, disqualificationReason: null, overriddenById: null,
    overrideReason: null, eligibilitySnapshot: null, deletedAt: null, ...over,
  });
}

function seedAttendance(over: Record<string, unknown> = {}): void {
  seed(h.db, "examAttendance", {
    id: "attn-1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT",
    checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null, ...over,
  });
}

const mark = (over: Record<string, unknown> = {}, context = ctx) =>
  new MarkExamCandidateAttendanceCommand(
    { examCandidateId: "cand-1", status: "PRESENT", ...over },
    context
  ).run();

const correct = (over: Record<string, unknown> = {}, context = ctx) =>
  new CorrectExamCandidateAttendanceCommand(
    { examCandidateId: "cand-1", status: "ABSENT", reason: "erro de registo", ...over },
    context
  ).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Mark ────────────────────────────────────────────────────────────────────

describe("MarkExamCandidateAttendanceCommand", () => {
  it("1. marks PRESENT → creates one attendance row + result DTO", async () => {
    seedSession();
    seedCandidate();
    const r = await mark();
    expect(r.status).toBe("PRESENT");
    expect(r.examSessionId).toBe("sess-1");
    expect(store("examAttendance")).toHaveLength(1);
    expect(store("examAttendance")[0].status).toBe("PRESENT");
    expect(store("examAttendance")[0].markedById).toBe("u-1");
    expect(r.attendanceId).toBe(store("examAttendance")[0].id);
  });

  it("2. marks ABSENT", async () => {
    seedSession();
    seedCandidate();
    const r = await mark({ status: "ABSENT" });
    expect(r.status).toBe("ABSENT");
    expect(store("examAttendance")[0].status).toBe("ABSENT");
  });

  it("3. marks LATE", async () => {
    seedSession();
    seedCandidate();
    const r = await mark({ status: "LATE" });
    expect(r.status).toBe("LATE");
  });

  it("4. marks EXCUSED with a reason", async () => {
    seedSession();
    seedCandidate();
    const r = await mark({ status: "EXCUSED", reason: "atestado médico" });
    expect(r.status).toBe("EXCUSED");
    expect(store("examAttendance")).toHaveLength(1);
  });

  it("5. marks EXCUSED with remarks only (no reason)", async () => {
    seedSession();
    seedCandidate();
    const r = await mark({ status: "EXCUSED", remarks: "justificado pela secretaria" });
    expect(r.status).toBe("EXCUSED");
    expect(store("examAttendance")[0].remarks).toBe("justificado pela secretaria");
  });

  it("6. marks DISQUALIFIED with a reason", async () => {
    seedSession();
    seedCandidate();
    const r = await mark({ status: "DISQUALIFIED", reason: "fraude" });
    expect(r.status).toBe("DISQUALIFIED");
  });

  it("7. EXCUSED without remarks/reason → ValidationError (no row)", async () => {
    seedSession();
    seedCandidate();
    await expect(mark({ status: "EXCUSED" })).rejects.toBeInstanceOf(ValidationError);
    expect(store("examAttendance")).toHaveLength(0);
  });

  it("8. DISQUALIFIED without reason → ValidationError", async () => {
    seedSession();
    seedCandidate();
    await expect(mark({ status: "DISQUALIFIED" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("9. stores checkedInAt", async () => {
    seedSession();
    seedCandidate();
    const r = await mark({ checkedInAt: CHECK_IN });
    expect(r.checkedInAt).toBeInstanceOf(Date);
    expect((store("examAttendance")[0].checkedInAt as Date).getTime()).toBe(CHECK_IN.getTime());
  });

  it("10. emits exam_attendance.marked event", async () => {
    seedSession();
    seedCandidate();
    await mark();
    const evt = eventsOf("exam_attendance.marked");
    expect(evt).toHaveLength(1);
    expect((evt[0] as { aggregateType: string }).aggregateType).toBe("EXAM_ATTENDANCE");
    expect((evt[0] as { newStatus: string }).newStatus).toBe("PRESENT");
  });

  it("11. writes an audit log", async () => {
    seedSession();
    seedCandidate();
    await mark();
    expect(auditFor("exam_attendance.marked")).toBeDefined();
  });

  it("12. audit metadata carries attendance / candidate / session / student ids", async () => {
    seedSession();
    seedCandidate();
    const r = await mark({ checkedInAt: CHECK_IN, remarks: "ok" });
    const nv = parseNew("exam_attendance.marked");
    expect(nv.attendanceId).toBe(r.attendanceId);
    expect(nv.candidateId).toBe("cand-1");
    expect(nv.sessionId).toBe("sess-1");
    expect(nv.studentId).toBe("stu-1");
    expect(nv.newStatus).toBe("PRESENT");
    expect(nv.markedBy).toBe("u-1");
    expect(nv.remarks).toBe("ok");
  });

  it("13. duplicate (find-guard) → ATTENDANCE_ALREADY_MARKED (not overwritten)", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    await expect(mark({ status: "ABSENT" })).rejects.toThrowError(/ATTENDANCE_ALREADY_MARKED/);
    // The pre-existing row is untouched.
    expect(store("examAttendance")).toHaveLength(1);
    expect(store("examAttendance")[0].status).toBe("PRESENT");
  });

  it("14. duplicate (P2002 on insert) → ATTENDANCE_ALREADY_MARKED", async () => {
    seedSession();
    seedCandidate();
    h.db.examAttendance.create = async () => {
      throw { code: "P2002", message: "unique constraint" };
    };
    await expect(mark()).rejects.toThrowError(/ATTENDANCE_ALREADY_MARKED/);
  });

  it("15. a non-REGISTERED candidate is rejected (CANDIDATE_NOT_REGISTERED)", async () => {
    seedSession();
    seedCandidate({ status: "WITHDRAWN" });
    await expect(mark()).rejects.toThrowError(/CANDIDATE_NOT_REGISTERED/);
    expect(store("examAttendance")).toHaveLength(0);
  });

  it("16. rejects a DRAFT session", async () => {
    seedSession({ status: "DRAFT" });
    seedCandidate();
    await expect(mark()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_ATTENDANCE/);
  });

  it("17. rejects a SCHEDULED session", async () => {
    seedSession({ status: "SCHEDULED" });
    seedCandidate();
    await expect(mark()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_ATTENDANCE/);
  });

  it("18. allows a LOCKED session", async () => {
    seedSession({ status: "LOCKED" });
    seedCandidate();
    const r = await mark();
    expect(r.status).toBe("PRESENT");
  });

  it("19. allows an IN_PROGRESS session", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate();
    const r = await mark();
    expect(store("examAttendance")).toHaveLength(1);
    expect(r.status).toBe("PRESENT");
  });

  it("20. rejects a COMPLETED session for MARK", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    await expect(mark()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_ATTENDANCE/);
  });

  it("21. rejects a RESULTS_RECORDED session", async () => {
    seedSession({ status: "RESULTS_RECORDED" });
    seedCandidate();
    await expect(mark()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_ATTENDANCE/);
  });

  it("22. rejects a PUBLISHED session", async () => {
    seedSession({ status: "PUBLISHED" });
    seedCandidate();
    await expect(mark()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_ATTENDANCE/);
  });

  it("23. rejects a CANCELLED session", async () => {
    seedSession({ status: "CANCELLED" });
    seedCandidate();
    await expect(mark()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_ATTENDANCE/);
  });

  it("24. cross-tenant candidate is hidden → NotFound", async () => {
    seedSession();
    seedCandidate();
    await expect(mark({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("25. a missing candidate is NotFound", async () => {
    seedSession();
    await expect(mark({ examCandidateId: "nope" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("26. rollback on a failed event write leaves zero side effects", async () => {
    seedSession();
    seedCandidate();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(mark()).rejects.toThrow(/boom/);
    expect(store("examAttendance")).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("27. DISQUALIFIED attendance does NOT mutate ExamCandidate.status (§6/§52)", async () => {
    seedSession();
    seedCandidate({ status: "REGISTERED" });
    await mark({ status: "DISQUALIFIED", reason: "irregularidade" });
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
    expect(store("examCandidate")[0].disqualifiedAt).toBeNull();
  });

  it("28. marking creates NO ExamResult row (§53)", async () => {
    seedSession();
    seedCandidate();
    await mark();
    expect(store("examResult")).toHaveLength(0);
  });

  it("29. requires exams.markAttendance", async () => {
    seedSession();
    seedCandidate();
    authState.allow = false;
    await expect(mark()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.markAttendance");
  });

  it("30. a normal PRESENT mark does not mutate the candidate", async () => {
    seedSession();
    seedCandidate({ status: "REGISTERED" });
    await mark();
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
  });
});

// ─── Correct ───────────────────────────────────────────────────────────────────

describe("CorrectExamCandidateAttendanceCommand", () => {
  it("31. corrects an existing row → new status + corrected event", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    const r = await correct({ status: "ABSENT" });
    expect(r.status).toBe("ABSENT");
    expect(r.previousStatus).toBe("PRESENT");
    expect(store("examAttendance")[0].status).toBe("ABSENT");
    expect(store("examAttendance")[0].markedById).toBe("u-1");
    expect(eventsOf("exam_attendance.corrected")).toHaveLength(1);
  });

  it("32. requires a reason (ValidationError)", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await expect(correct({ reason: "" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("33. preserves the previous status in the corrected event", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "LATE" });
    await correct({ status: "PRESENT" });
    const evt = eventsOf("exam_attendance.corrected")[0] as { previousStatus: string; newStatus: string };
    expect(evt.previousStatus).toBe("LATE");
    expect(evt.newStatus).toBe("PRESENT");
  });

  it("34. preserves the previous status in the audit oldValues", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT", remarks: "antigo" });
    await correct({ status: "ABSENT" });
    const ov = parseOld("exam_attendance.corrected");
    expect(ov.status).toBe("PRESENT");
    expect(ov.remarks).toBe("antigo");
    const nv = parseNew("exam_attendance.corrected");
    expect(nv.newStatus).toBe("ABSENT");
    expect(nv.previousStatus).toBe("PRESENT");
  });

  it("35. a missing attendance row is NotFound (ATTENDANCE_NOT_FOUND)", async () => {
    seedSession();
    seedCandidate();
    await expect(correct()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("36. allows a LOCKED session", async () => {
    seedSession({ status: "LOCKED" });
    seedCandidate();
    seedAttendance();
    const r = await correct();
    expect(r.status).toBe("ABSENT");
  });

  it("37. allows an IN_PROGRESS session", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate();
    seedAttendance();
    const r = await correct();
    expect(r.status).toBe("ABSENT");
  });

  it("38. allows a COMPLETED session (correction only)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedAttendance();
    const r = await correct();
    expect(r.status).toBe("ABSENT");
  });

  it("39. rejects a RESULTS_RECORDED session", async () => {
    seedSession({ status: "RESULTS_RECORDED" });
    seedCandidate();
    seedAttendance();
    await expect(correct()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_CORRECTION/);
  });

  it("40. rejects a PUBLISHED session", async () => {
    seedSession({ status: "PUBLISHED" });
    seedCandidate();
    seedAttendance();
    await expect(correct()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_CORRECTION/);
  });

  it("41. rejects a CANCELLED session", async () => {
    seedSession({ status: "CANCELLED" });
    seedCandidate();
    seedAttendance();
    await expect(correct()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_CORRECTION/);
  });

  it("42. a lost race (conditional count 0) aborts — no corrected event", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    h.db.examAttendance.updateMany = async () => ({ count: 0 });
    await expect(correct()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(eventsOf("exam_attendance.corrected")).toHaveLength(0);
  });

  it("43. double correction is race-safe and chains (PRESENT→LATE→ABSENT)", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    await correct({ status: "LATE" });
    await correct({ status: "ABSENT" });
    expect(store("examAttendance")[0].status).toBe("ABSENT");
    expect(eventsOf("exam_attendance.corrected")).toHaveLength(2);
  });

  it("44. correction mutates neither the candidate nor any result", async () => {
    seedSession();
    seedCandidate({ status: "REGISTERED" });
    seedAttendance({ status: "PRESENT" });
    await correct({ status: "DISQUALIFIED" });
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
    expect(store("examResult")).toHaveLength(0);
  });

  it("45. requires exams.correctAttendance", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    authState.allow = false;
    await expect(correct()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.correctAttendance");
  });

  it("46. cross-tenant attendance is hidden → NotFound", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await expect(correct({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Bulk mark ───────────────────────────────────────────────────────────────

describe("BulkMarkExamAttendanceCommand", () => {
  const bulk = (items: Record<string, unknown>[], over: Record<string, unknown> = {}, context = ctx) =>
    new BulkMarkExamAttendanceCommand(
      { examSessionId: "sess-1", items: items as BulkMarkExamAttendanceInput["items"], ...over },
      context
    ).run();

  it("47. marks multiple candidates (all ok)", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    const r = await bulk([
      { examCandidateId: "cand-1", status: "PRESENT" },
      { examCandidateId: "cand-2", status: "ABSENT" },
    ]);
    expect(r.total).toBe(2);
    expect(r.succeeded).toBe(2);
    expect(r.failed).toBe(0);
    expect(store("examAttendance")).toHaveLength(2);
  });

  it("48. mixed batch: one ok, one failure (non-REGISTERED)", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2", status: "WITHDRAWN" });
    const r = await bulk([
      { examCandidateId: "cand-1", status: "PRESENT" },
      { examCandidateId: "cand-2", status: "PRESENT" },
    ]);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
    const failed = r.items.find((i) => !i.ok);
    expect(failed?.code).toBe("CANDIDATE_NOT_REGISTERED");
  });

  it("49. stopOnFailure=false continues after a failure", async () => {
    seedSession();
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    const r = await bulk([
      { examCandidateId: "missing", status: "PRESENT" },
      { examCandidateId: "cand-2", status: "PRESENT" },
    ]);
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.skipped).toBe(0);
  });

  it("50. stopOnFailure=true skips the remaining items", async () => {
    seedSession();
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    const r = await bulk(
      [
        { examCandidateId: "missing", status: "PRESENT" },
        { examCandidateId: "cand-2", status: "PRESENT" },
      ],
      { stopOnFailure: true }
    );
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.succeeded).toBe(0);
    expect(r.items[1].code).toBe("SKIPPED");
  });

  it("51. counts invariant: total === succeeded + failed + skipped", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2", status: "WITHDRAWN" });
    const r = await bulk(
      [
        { examCandidateId: "cand-1", status: "PRESENT" },
        { examCandidateId: "cand-2", status: "PRESENT" },
        { examCandidateId: "missing", status: "PRESENT" },
      ],
      { stopOnFailure: true }
    );
    expect(r.total).toBe(r.succeeded + r.failed + r.skipped);
  });

  it("52. a cross-tenant item becomes a failure, not a throw", async () => {
    seedSession();
    seed(h.db, "examCandidate", {
      id: "cand-x", organizationId: OTHER_ORG, examSessionId: "sess-1", examAttemptId: "att-0",
      studentId: "stu-9", enrollmentId: "enr-9", eligibilityStatus: "ELIGIBLE", status: "REGISTERED",
      assignedSeat: null, registeredAt: S_START, registeredById: "u-0", withdrawnAt: null, withdrawnById: null,
      disqualifiedAt: null, disqualifiedById: null, disqualificationReason: null, overriddenById: null,
      overrideReason: null, eligibilitySnapshot: null, deletedAt: null,
    });
    const r = await bulk([{ examCandidateId: "cand-x", status: "PRESENT" }]);
    expect(r.failed).toBe(1);
    expect(r.items[0].ok).toBe(false);
    expect(r.items[0].code).toBe("NOT_FOUND");
  });

  it("53. delegates to the single Mark command once per processed item", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    const spy = vi.spyOn(MarkExamCandidateAttendanceCommand.prototype, "run").mockResolvedValue({
      attendanceId: "x", examCandidateId: "x", examSessionId: "sess-1", status: "PRESENT",
      checkedInAt: null, markedAt: new Date(),
    });
    await bulk([
      { examCandidateId: "cand-1", status: "PRESENT" },
      { examCandidateId: "cand-2", status: "PRESENT" },
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("54. an unknown per-item error is sanitised to INTERNAL_ERROR", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    vi.spyOn(MarkExamCandidateAttendanceCommand.prototype, "run").mockRejectedValue(
      new Error("something raw and leaky")
    );
    const r = await bulk([{ examCandidateId: "cand-1", status: "PRESENT" }]);
    expect(r.failed).toBe(1);
    expect(r.items[0].code).toBe("INTERNAL_ERROR");
    expect(r.items[0].message).not.toMatch(/raw and leaky/);
  });

  it("55. requires exams.markAttendance up-front (denied → no delegation)", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    authState.allow = false;
    const spy = vi.spyOn(MarkExamCandidateAttendanceCommand.prototype, "run");
    await expect(bulk([{ examCandidateId: "cand-1", status: "PRESENT" }])).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(authState.checked).toContain("exams.markAttendance");
    expect(spy).not.toHaveBeenCalled();
  });
});
