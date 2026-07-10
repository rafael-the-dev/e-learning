import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 7 EXAM RESULT-ENTRY COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives create / update-draft / submit + bulk against the rollback-capable
// in-memory fake DB. These prove the Examination Engine records an OFFICIAL EXAM
// FACT up to DRAFT/SUBMITTED ONLY: the attendance fact drives the resultCode, a
// SCORED result normalizes deterministically, and an ExamEvent + AuditLog are
// written INSIDE the command tx. They also prove NO final grade / progress row is
// written and that ExamCandidate.status / ExamSession.status are NEVER mutated.
// `@/server/db` (→ fake) and `@/server/auth/rbac` (allow/deny + recorded perms)
// are the only mocks — result entry runs no eligibility engine.
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

import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  BulkCreateExamResultsCommand,
  BulkSubmitExamResultsCommand,
  CreateExamResultCommand,
  SubmitExamResultCommand,
  UpdateDraftExamResultCommand,
} from "../result-entry.commands";
import type {
  BulkCreateExamResultsInput,
  BulkSubmitExamResultsInput,
} from "@/modules/examinations/schemas/result-entry.schema";

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
    id: "cand-1", organizationId: ORG, examSessionId: "sess-1", examAttemptId: "att-1",
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

function seedResult(over: Record<string, unknown> = {}): void {
  seed(h.db, "examResult", {
    id: "res-1", organizationId: ORG, examCandidateId: "cand-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1",
    score: 45, maxScore: 60, normalizedScore: 75, status: "DRAFT", resultCode: "SCORED",
    markerId: "u-0", reviewedById: null, approvedById: null, submittedAt: null, reviewedAt: null,
    approvedAt: null, publishedAt: null, invalidatedAt: null, invalidationReason: null,
    remarks: null, resultChecksum: null, currentRevisionId: null, ...over,
  });
}

const create = (over: Record<string, unknown> = {}, context = ctx) =>
  new CreateExamResultCommand(
    { examCandidateId: "cand-1", maxScore: 60, ...over },
    context
  ).run();

const update = (over: Record<string, unknown> = {}, context = ctx) =>
  new UpdateDraftExamResultCommand({ examResultId: "res-1", ...over }, context).run();

const submit = (over: Record<string, unknown> = {}, context = ctx) =>
  new SubmitExamResultCommand({ examResultId: "res-1", ...over }, context).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Create ──────────────────────────────────────────────────────────────────

describe("CreateExamResultCommand", () => {
  it("1. PRESENT → DRAFT SCORED result with normalizedScore 45/60 → 75.00", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    const r = await create({ score: 45 });
    expect(r.status).toBe("DRAFT");
    expect(r.resultCode).toBe("SCORED");
    expect(r.score).toBe(45);
    expect(r.normalizedScore).toBe(75);
    expect(store("examResult")).toHaveLength(1);
    expect(store("examResult")[0].markerId).toBe("u-1");
    expect(store("examResult")[0].status).toBe("DRAFT");
    expect(r.examResultId).toBe(store("examResult")[0].id);
  });

  it("2. LATE → SCORED", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "LATE" });
    const r = await create({ score: 30 });
    expect(r.resultCode).toBe("SCORED");
    expect(r.score).toBe(30);
    expect(r.normalizedScore).toBe(50);
  });

  it("3. ABSENT → ABSENT, score + normalizedScore null", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "ABSENT" });
    const r = await create();
    expect(r.resultCode).toBe("ABSENT");
    expect(r.score).toBeNull();
    expect(r.normalizedScore).toBeNull();
    expect(store("examResult")[0].score).toBeNull();
  });

  it("4. EXCUSED → EXCUSED, score null", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "EXCUSED" });
    const r = await create();
    expect(r.resultCode).toBe("EXCUSED");
    expect(r.score).toBeNull();
  });

  it("5. DISQUALIFIED (attendance) with a reason → DISQUALIFIED, score null", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "DISQUALIFIED" });
    const r = await create({ reason: "fraude" });
    expect(r.resultCode).toBe("DISQUALIFIED");
    expect(r.score).toBeNull();
  });

  it("6. DISQUALIFIED without a reason → BusinessRuleError REASON_REQUIRED", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "DISQUALIFIED" });
    await expect(create()).rejects.toThrowError(/REASON_REQUIRED/);
    expect(store("examResult")).toHaveLength(0);
  });

  it("7. missing attendance → ATTENDANCE_NOT_MARKED (attendance never inferred)", async () => {
    seedSession();
    seedCandidate();
    await expect(create({ score: 45 })).rejects.toThrowError(/ATTENDANCE_NOT_MARKED/);
    expect(store("examResult")).toHaveLength(0);
    expect(store("examAttendance")).toHaveLength(0);
  });

  it("8. a non-REGISTERED candidate is rejected (CANDIDATE_NOT_REGISTERED)", async () => {
    seedSession();
    seedCandidate({ status: "WITHDRAWN" });
    seedAttendance();
    await expect(create({ score: 45 })).rejects.toThrowError(/CANDIDATE_NOT_REGISTERED/);
  });

  it("9. allows an IN_PROGRESS session", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate();
    seedAttendance();
    const r = await create({ score: 45 });
    expect(r.status).toBe("DRAFT");
  });

  it("10. allows a COMPLETED session", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedAttendance();
    const r = await create({ score: 45 });
    expect(r.status).toBe("DRAFT");
  });

  it("11. rejects a DRAFT session", async () => {
    seedSession({ status: "DRAFT" });
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 45 })).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("12. rejects a SCHEDULED session", async () => {
    seedSession({ status: "SCHEDULED" });
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 45 })).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("13. rejects a LOCKED session", async () => {
    seedSession({ status: "LOCKED" });
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 45 })).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("14. rejects a RESULTS_RECORDED session", async () => {
    seedSession({ status: "RESULTS_RECORDED" });
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 45 })).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("15. rejects a PUBLISHED session", async () => {
    seedSession({ status: "PUBLISHED" });
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 45 })).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("16. rejects a CANCELLED session", async () => {
    seedSession({ status: "CANCELLED" });
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 45 })).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("17. duplicate (find-guard) → RESULT_ALREADY_EXISTS (not overwritten)", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    seedResult({ score: 10, maxScore: 60, normalizedScore: 16.67 });
    await expect(create({ score: 45 })).rejects.toThrowError(/RESULT_ALREADY_EXISTS/);
    expect(store("examResult")).toHaveLength(1);
    expect(store("examResult")[0].score).toBe(10);
  });

  it("18. duplicate (P2002 on insert) → RESULT_ALREADY_EXISTS", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    h.db.examResult.create = async () => {
      throw { code: "P2002", message: "unique constraint" };
    };
    await expect(create({ score: 45 })).rejects.toThrowError(/RESULT_ALREADY_EXISTS/);
  });

  it("19. score < 0 → SCORE_OUT_OF_RANGE", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await expect(create({ score: -1 })).rejects.toThrowError(/SCORE_OUT_OF_RANGE/);
  });

  it("20. score > maxScore → SCORE_OUT_OF_RANGE", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 61 })).rejects.toThrowError(/SCORE_OUT_OF_RANGE/);
  });

  it("21. maxScore <= 0 → MAX_SCORE_INVALID", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 0, maxScore: 0 })).rejects.toThrowError(/MAX_SCORE_INVALID/);
  });

  it("22. SCORED requires a score (PRESENT, no score) → SCORE_REQUIRED", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    await expect(create()).rejects.toThrowError(/SCORE_REQUIRED/);
  });

  it("23. normalizedScore correctness: 1/3 of 3 → 33.33 (2 dp)", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    const r = await create({ score: 1, maxScore: 3 });
    expect(r.normalizedScore).toBe(33.33);
  });

  it("24. score == maxScore → 100.00", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    const r = await create({ score: 60, maxScore: 60 });
    expect(r.normalizedScore).toBe(100);
  });

  it("25. resultCode↔attendance mismatch (PRESENT but ABSENT) → RESULT_CODE_MISMATCH", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    await expect(create({ score: 45, resultCode: "ABSENT" })).rejects.toThrowError(/RESULT_CODE_MISMATCH/);
  });

  it("26. a matching client resultCode (PRESENT + SCORED) is accepted", async () => {
    seedSession();
    seedCandidate();
    seedAttendance({ status: "PRESENT" });
    const r = await create({ score: 45, resultCode: "SCORED" });
    expect(r.resultCode).toBe("SCORED");
  });

  it("27. emits exam_result.created event", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await create({ score: 45 });
    const evt = eventsOf("exam_result.created");
    expect(evt).toHaveLength(1);
    expect((evt[0] as { aggregateType: string }).aggregateType).toBe("EXAM_RESULT");
    expect((evt[0] as { newStatus: string }).newStatus).toBe("DRAFT");
  });

  it("28. writes an audit log with the result / candidate / session ids", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    const r = await create({ score: 45, remarks: "ok" });
    const nv = parseNew("exam_result.created");
    expect(nv.examResultId).toBe(r.examResultId);
    expect(nv.candidateId).toBe("cand-1");
    expect(nv.sessionId).toBe("sess-1");
    expect(nv.studentId).toBe("stu-1");
    expect(nv.resultCode).toBe("SCORED");
    expect(nv.normalizedScore).toBe(75);
    expect(nv.markerId).toBe("u-1");
    expect(nv.remarks).toBe("ok");
  });

  it("29. rollback on a failed event write leaves zero side effects", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(create({ score: 45 })).rejects.toThrow(/boom/);
    expect(store("examResult")).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("30. cross-tenant candidate is hidden → NotFound", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await expect(create({ score: 45 }, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("31. a missing candidate is NotFound", async () => {
    seedSession();
    await expect(create({ examCandidateId: "nope", score: 45 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("32. requires exams.enterResults", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    authState.allow = false;
    await expect(create({ score: 45 })).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.enterResults");
  });

  it("33. does NOT mutate ExamCandidate.status", async () => {
    seedSession();
    seedCandidate({ status: "REGISTERED" });
    seedAttendance();
    await create({ score: 45 });
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
  });

  it("34. does NOT mutate ExamSession.status", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate();
    seedAttendance();
    await create({ score: 45 });
    expect(store("examSession")[0].status).toBe("IN_PROGRESS");
  });

  it("35. writes NO StudentSubject/Level/Course progress row (records a fact only)", async () => {
    seedSession();
    seedCandidate();
    seedAttendance();
    await create({ score: 45 });
    expect(store("studentSubjectProgress")).toHaveLength(0);
    expect(store("studentLevelProgress")).toHaveLength(0);
    expect(store("studentCourseProgress")).toHaveLength(0);
  });

  it("36. copies studentId / enrollmentId / examAttemptId / levelSubjectId from domain facts", async () => {
    seedSession({ levelSubjectId: "ls-9" });
    seedCandidate({ studentId: "stu-7", enrollmentId: "enr-7", examAttemptId: "att-7" });
    seedAttendance();
    await create({ score: 45 });
    const row = store("examResult")[0];
    expect(row.studentId).toBe("stu-7");
    expect(row.enrollmentId).toBe("enr-7");
    expect(row.examAttemptId).toBe("att-7");
    expect(row.levelSubjectId).toBe("ls-9");
  });
});

// ─── Update draft ────────────────────────────────────────────────────────────

describe("UpdateDraftExamResultCommand", () => {
  it("37. edits a DRAFT result and recomputes normalizedScore", async () => {
    seedResult({ score: 45, maxScore: 60, normalizedScore: 75 });
    seedAttendance({ status: "PRESENT" });
    const r = await update({ score: 30 });
    expect(r.score).toBe(30);
    expect(r.normalizedScore).toBe(50);
    expect(store("examResult")[0].score).toBe(30);
    expect(store("examResult")[0].normalizedScore).toBe(50);
  });

  it("38. preserves the previous values in the audit oldValues", async () => {
    seedResult({ score: 45, maxScore: 60, normalizedScore: 75, remarks: "antigo" });
    seedAttendance({ status: "PRESENT" });
    await update({ score: 30, remarks: "novo" });
    const ov = parseOld("exam_result.updated");
    expect(ov.score).toBe(45);
    expect(ov.normalizedScore).toBe(75);
    expect(ov.remarks).toBe("antigo");
    const nv = parseNew("exam_result.updated");
    expect(nv.score).toBe(30);
    expect(nv.remarks).toBe("novo");
  });

  it("39. emits exam_result.updated event", async () => {
    seedResult();
    seedAttendance();
    await update({ score: 30 });
    expect(eventsOf("exam_result.updated")).toHaveLength(1);
  });

  it("40. rejects a SUBMITTED result → RESULT_NOT_DRAFT", async () => {
    seedResult({ status: "SUBMITTED" });
    seedAttendance();
    await expect(update({ score: 30 })).rejects.toThrowError(/RESULT_NOT_DRAFT/);
  });

  it("41. rejects a REVIEWED result", async () => {
    seedResult({ status: "REVIEWED" });
    seedAttendance();
    await expect(update({ score: 30 })).rejects.toThrowError(/RESULT_NOT_DRAFT/);
  });

  it("42. rejects an APPROVED result", async () => {
    seedResult({ status: "APPROVED" });
    seedAttendance();
    await expect(update({ score: 30 })).rejects.toThrowError(/RESULT_NOT_DRAFT/);
  });

  it("43. rejects a PUBLISHED result", async () => {
    seedResult({ status: "PUBLISHED" });
    seedAttendance();
    await expect(update({ score: 30 })).rejects.toThrowError(/RESULT_NOT_DRAFT/);
  });

  it("44. rejects an INVALIDATED result", async () => {
    seedResult({ status: "INVALIDATED" });
    seedAttendance();
    await expect(update({ score: 30 })).rejects.toThrowError(/RESULT_NOT_DRAFT/);
  });

  it("45. a lost race (conditional count 0) aborts — no updated event", async () => {
    seedResult();
    seedAttendance();
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(update({ score: 30 })).rejects.toBeInstanceOf(BusinessRuleError);
    expect(eventsOf("exam_result.updated")).toHaveLength(0);
  });

  it("46. a missing result is NotFound", async () => {
    await expect(update({ score: 30 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("47. cross-tenant result is hidden → NotFound", async () => {
    seedResult();
    seedAttendance();
    await expect(update({ score: 30 }, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("48. requires exams.enterResults", async () => {
    seedResult();
    seedAttendance();
    authState.allow = false;
    await expect(update({ score: 30 })).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.enterResults");
  });

  it("49. re-derives from a CORRECTED attendance (PRESENT→ABSENT) → score forced null", async () => {
    seedResult({ score: 45, maxScore: 60, normalizedScore: 75, resultCode: "SCORED" });
    seedAttendance({ status: "ABSENT" });
    const r = await update();
    expect(r.resultCode).toBe("ABSENT");
    expect(r.score).toBeNull();
    expect(r.normalizedScore).toBeNull();
    expect(store("examResult")[0].score).toBeNull();
  });

  it("50. a partial update (remarks only) keeps the existing score", async () => {
    seedResult({ score: 45, maxScore: 60, normalizedScore: 75 });
    seedAttendance({ status: "PRESENT" });
    const r = await update({ remarks: "revisto" });
    expect(r.score).toBe(45);
    expect(r.normalizedScore).toBe(75);
    expect(store("examResult")[0].remarks).toBe("revisto");
  });

  it("51. does not mutate the candidate or the session", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate({ status: "REGISTERED" });
    seedResult();
    seedAttendance();
    await update({ score: 30 });
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
    expect(store("examSession")[0].status).toBe("IN_PROGRESS");
  });

  it("52. returns updatedAt", async () => {
    seedResult();
    seedAttendance();
    const r = await update({ score: 30 });
    expect(r.updatedAt).toBeInstanceOf(Date);
  });
});

// ─── Submit ────────────────────────────────────────────────────────────────────

describe("SubmitExamResultCommand", () => {
  it("53. DRAFT → SUBMITTED, sets submittedAt", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ status: "DRAFT" });
    seedAttendance({ status: "PRESENT" });
    const r = await submit();
    expect(r.status).toBe("SUBMITTED");
    expect(r.submittedAt).toBeInstanceOf(Date);
    expect(store("examResult")[0].status).toBe("SUBMITTED");
    expect(store("examResult")[0].submittedAt).toBeInstanceOf(Date);
  });

  it("54. requires a COMPLETED session (IN_PROGRESS rejected) → SESSION_NOT_COMPLETED", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate();
    seedResult();
    await expect(submit()).rejects.toThrowError(/SESSION_NOT_COMPLETED/);
  });

  it("55. rejects an incomplete SCORED result (score null) → RESULT_INCOMPLETE", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ resultCode: "SCORED", score: null, normalizedScore: null });
    await expect(submit()).rejects.toThrowError(/RESULT_INCOMPLETE/);
  });

  it("56. accepts a complete non-SCORED result (ABSENT with null score)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ resultCode: "ABSENT", score: null, normalizedScore: null });
    seedAttendance({ status: "ABSENT" });
    const r = await submit();
    expect(r.status).toBe("SUBMITTED");
  });

  it("57. preserves the marker (markerId not overwritten by the submitter)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ markerId: "marker-9" });
    seedAttendance({ status: "PRESENT" });
    await submit();
    expect(store("examResult")[0].markerId).toBe("marker-9");
  });

  it("58. the submitter is recorded in the event / audit metadata", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult();
    seedAttendance({ status: "PRESENT" });
    await submit();
    const nv = parseNew("exam_result.submitted");
    expect(nv.submittedBy).toBe("u-1");
    expect(nv.status).toBe("SUBMITTED");
  });

  it("59. a second submit is rejected (count 0) → RESULT_CONCURRENTLY_CHANGED", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ status: "DRAFT" });
    seedAttendance({ status: "PRESENT" });
    await submit();
    await expect(submit()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
  });

  it("60. a lost race (conditional count 0) aborts — no submitted event", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult();
    seedAttendance({ status: "PRESENT" });
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(submit()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(eventsOf("exam_result.submitted")).toHaveLength(0);
  });

  it("61. rollback on a failed event write leaves the result DRAFT", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ status: "DRAFT" });
    seedAttendance({ status: "PRESENT" });
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(submit()).rejects.toThrow(/boom/);
    expect(store("examResult")[0].status).toBe("DRAFT");
    expect(audits()).toHaveLength(0);
  });

  it("62. requires exams.submitResults", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult();
    authState.allow = false;
    await expect(submit()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.submitResults");
  });

  it("63. a missing result is NotFound", async () => {
    await expect(submit()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("64. does not mutate the candidate or the session", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate({ status: "REGISTERED" });
    seedResult();
    seedAttendance({ status: "PRESENT" });
    await submit();
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
    expect(store("examSession")[0].status).toBe("COMPLETED");
  });

  it("64a. a SCORED draft whose attendance was corrected to ABSENT → RESULT_STALE (freeze, never re-derive)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ resultCode: "SCORED", score: 45, maxScore: 60, normalizedScore: 75, status: "DRAFT" });
    seedAttendance({ status: "ABSENT" }); // corrected after the draft was recorded
    await expect(submit()).rejects.toThrowError(/RESULT_STALE/);
    // The submit VALIDATES only — the draft is left untouched (no silent re-derivation).
    expect(store("examResult")[0].status).toBe("DRAFT");
    expect(store("examResult")[0].resultCode).toBe("SCORED");
    expect(store("examResult")[0].score).toBe(45);
    expect(eventsOf("exam_result.submitted")).toHaveLength(0);
  });

  it("64b. an ABSENT draft whose attendance was corrected to PRESENT → RESULT_STALE (reverse direction)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ resultCode: "ABSENT", score: null, normalizedScore: null, status: "DRAFT" });
    seedAttendance({ status: "PRESENT" });
    await expect(submit()).rejects.toThrowError(/RESULT_STALE/);
    expect(store("examResult")[0].status).toBe("DRAFT");
  });

  it("64c. LATE still maps to SCORED, so a SCORED draft submits cleanly under LATE attendance", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ resultCode: "SCORED", score: 30, maxScore: 60, normalizedScore: 50, status: "DRAFT" });
    seedAttendance({ status: "LATE" });
    const r = await submit();
    expect(r.status).toBe("SUBMITTED");
  });

  it("64d. missing attendance at submit → ATTENDANCE_NOT_MARKED (never inferred)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate();
    seedResult({ status: "DRAFT" });
    await expect(submit()).rejects.toThrowError(/ATTENDANCE_NOT_MARKED/);
    expect(store("examResult")[0].status).toBe("DRAFT");
  });
});

// ─── Bulk create ─────────────────────────────────────────────────────────────

describe("BulkCreateExamResultsCommand", () => {
  const bulk = (items: Record<string, unknown>[], over: Record<string, unknown> = {}, context = ctx) =>
    new BulkCreateExamResultsCommand(
      { examSessionId: "sess-1", items: items as BulkCreateExamResultsInput["items"], ...over },
      context
    ).run();

  it("65. creates results for multiple candidates (all ok)", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    seed(h.db, "examAttendance", { id: "a2", organizationId: ORG, examCandidateId: "cand-2", status: "ABSENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const r = await bulk([
      { examCandidateId: "cand-1", maxScore: 60, score: 45 },
      { examCandidateId: "cand-2", maxScore: 60 },
    ]);
    expect(r.total).toBe(2);
    expect(r.succeeded).toBe(2);
    expect(r.failed).toBe(0);
    expect(store("examResult")).toHaveLength(2);
  });

  it("66. mixed batch: one ok, one failure (missing attendance)", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const r = await bulk([
      { examCandidateId: "cand-1", maxScore: 60, score: 45 },
      { examCandidateId: "cand-2", maxScore: 60, score: 45 },
    ]);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
    const failed = r.items.find((i) => !i.ok);
    expect(failed?.code).toBe("ATTENDANCE_NOT_MARKED");
  });

  it("67. stopOnFailure=false continues after a failure", async () => {
    seedSession();
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seed(h.db, "examAttendance", { id: "a2", organizationId: ORG, examCandidateId: "cand-2", status: "ABSENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const r = await bulk([
      { examCandidateId: "missing", maxScore: 60, score: 45 },
      { examCandidateId: "cand-2", maxScore: 60 },
    ]);
    expect(r.failed).toBe(1);
    expect(r.succeeded).toBe(1);
    expect(r.skipped).toBe(0);
  });

  it("68. stopOnFailure=true skips the remaining items", async () => {
    seedSession();
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seed(h.db, "examAttendance", { id: "a2", organizationId: ORG, examCandidateId: "cand-2", status: "ABSENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const r = await bulk(
      [
        { examCandidateId: "missing", maxScore: 60, score: 45 },
        { examCandidateId: "cand-2", maxScore: 60 },
      ],
      { stopOnFailure: true }
    );
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.succeeded).toBe(0);
    expect(r.items[1].code).toBe("SKIPPED");
  });

  it("69. counts invariant: total === succeeded + failed + skipped", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const r = await bulk(
      [
        { examCandidateId: "cand-1", maxScore: 60, score: 45 },
        { examCandidateId: "missing", maxScore: 60, score: 45 },
        { examCandidateId: "missing-2", maxScore: 60, score: 45 },
      ],
      { stopOnFailure: true }
    );
    expect(r.total).toBe(r.succeeded + r.failed + r.skipped);
  });

  it("70. delegates to the single Create command once per processed item", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    const spy = vi.spyOn(CreateExamResultCommand.prototype, "run").mockResolvedValue({
      examResultId: "x", examCandidateId: "x", examSessionId: "sess-1", status: "DRAFT",
      resultCode: "SCORED", score: 45, maxScore: 60, normalizedScore: 75,
    });
    await bulk([
      { examCandidateId: "cand-1", maxScore: 60, score: 45 },
      { examCandidateId: "cand-2", maxScore: 60, score: 45 },
    ]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("71. an unknown per-item error is sanitised to INTERNAL_ERROR", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    vi.spyOn(CreateExamResultCommand.prototype, "run").mockRejectedValue(
      new Error("something raw and leaky")
    );
    const r = await bulk([{ examCandidateId: "cand-1", maxScore: 60, score: 45 }]);
    expect(r.failed).toBe(1);
    expect(r.items[0].code).toBe("INTERNAL_ERROR");
    expect(r.items[0].message).not.toMatch(/raw and leaky/);
  });

  it("72. requires exams.enterResults up-front (denied → no delegation)", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    authState.allow = false;
    const spy = vi.spyOn(CreateExamResultCommand.prototype, "run");
    await expect(bulk([{ examCandidateId: "cand-1", maxScore: 60, score: 45 }])).rejects.toBeInstanceOf(
      AuthorizationError
    );
    expect(authState.checked).toContain("exams.enterResults");
    expect(spy).not.toHaveBeenCalled();
  });

  it("72a. a candidate from another session is failed CANDIDATE_NOT_IN_SESSION (never delegated)", async () => {
    seedSession(); // sess-1
    seedCandidate({ id: "cand-1" }); // sess-1
    seedCandidate({ id: "cand-9", examSessionId: "sess-OTHER", studentId: "stu-9" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const spy = vi.spyOn(CreateExamResultCommand.prototype, "run");
    const r = await bulk([
      { examCandidateId: "cand-1", maxScore: 60, score: 45 },
      { examCandidateId: "cand-9", maxScore: 60, score: 45 },
    ]);
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
    const bad = r.items.find((i) => i.examCandidateId === "cand-9");
    expect(bad?.code).toBe("CANDIDATE_NOT_IN_SESSION");
    expect(spy).toHaveBeenCalledTimes(1); // only the in-session candidate delegates
  });

  it("72b. a missing candidate is also CANDIDATE_NOT_IN_SESSION (not a valid target)", async () => {
    seedSession();
    const r = await bulk([{ examCandidateId: "ghost", maxScore: 60, score: 45 }]);
    expect(r.failed).toBe(1);
    expect(r.items[0].code).toBe("CANDIDATE_NOT_IN_SESSION");
  });
});

// ─── Bulk submit ─────────────────────────────────────────────────────────────

describe("BulkSubmitExamResultsCommand", () => {
  const bulk = (items: Record<string, unknown>[], over: Record<string, unknown> = {}, context = ctx) =>
    new BulkSubmitExamResultsCommand(
      { examSessionId: "sess-1", items: items as BulkSubmitExamResultsInput["items"], ...over },
      context
    ).run();

  it("73. submits multiple results (all ok)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seedResult({ id: "res-1", examCandidateId: "cand-1" });
    seedResult({ id: "res-2", examCandidateId: "cand-2" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    seed(h.db, "examAttendance", { id: "a2", organizationId: ORG, examCandidateId: "cand-2", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const r = await bulk([{ examResultId: "res-1" }, { examResultId: "res-2" }]);
    expect(r.succeeded).toBe(2);
    expect(store("examResult").every((x) => x.status === "SUBMITTED")).toBe(true);
  });

  it("74. delegates to the single Submit command once per item", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seedResult({ id: "res-1", examCandidateId: "cand-1" });
    seedResult({ id: "res-2", examCandidateId: "cand-2" });
    const spy = vi.spyOn(SubmitExamResultCommand.prototype, "run").mockResolvedValue({
      examResultId: "x", status: "SUBMITTED", submittedAt: new Date(),
    });
    await bulk([{ examResultId: "res-1" }, { examResultId: "res-2" }]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("74a. a result from another session is failed RESULT_NOT_IN_SESSION (never delegated)", async () => {
    seedSession({ status: "COMPLETED" }); // sess-1
    seedCandidate({ id: "cand-9", examSessionId: "sess-OTHER", studentId: "stu-9" });
    seedResult({ id: "res-9", examCandidateId: "cand-9" });
    const spy = vi.spyOn(SubmitExamResultCommand.prototype, "run");
    const r = await bulk([{ examResultId: "res-9" }]);
    expect(r.failed).toBe(1);
    expect(r.items[0].code).toBe("RESULT_NOT_IN_SESSION");
    expect(spy).not.toHaveBeenCalled();
  });

  it("75. counts invariant with a failure and a skip (stopOnFailure)", async () => {
    seedSession({ status: "COMPLETED" });
    seedCandidate({ id: "cand-1" });
    seedResult({ id: "res-1", examCandidateId: "cand-1" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    const r = await bulk(
      [{ examResultId: "missing" }, { examResultId: "res-1" }],
      { stopOnFailure: true }
    );
    expect(r.total).toBe(r.succeeded + r.failed + r.skipped);
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("76. requires exams.submitResults up-front (denied → no delegation)", async () => {
    seedSession({ status: "COMPLETED" });
    authState.allow = false;
    const spy = vi.spyOn(SubmitExamResultCommand.prototype, "run");
    await expect(bulk([{ examResultId: "res-1" }])).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.submitResults");
    expect(spy).not.toHaveBeenCalled();
  });
});
