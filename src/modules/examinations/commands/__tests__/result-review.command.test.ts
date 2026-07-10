import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 8 EXAM RESULT REVIEW / APPROVAL COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives review / approve / return-for-correction + bulk against the rollback-
// capable in-memory fake DB. These prove the Examination Engine advances an
// OFFICIAL EXAM RESULT up to REVIEWED / APPROVED ONLY under a STRICT marker ≠
// reviewer ≠ approver control: a SUBMITTED row is reviewed then approved (or
// returned to DRAFT), attendance + internal consistency are RE-VALIDATED, and an
// ExamEvent + AuditLog are written INSIDE the command tx. They also prove NO
// publication / final grade / progress row is written, that the score / resultCode
// are never edited here, and that ExamCandidate.status / ExamSession.status are
// NEVER mutated. `@/server/db` (→ fake) and `@/server/auth/rbac` (allow/deny +
// recorded perms) are the only mocks — review runs no eligibility engine.
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

import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  ApproveExamResultCommand,
  BulkApproveExamResultsCommand,
  BulkReviewExamResultsCommand,
  ReturnExamResultForCorrectionCommand,
  ReviewExamResultCommand,
} from "../result-review.commands";
import type {
  BulkApproveExamResultsInput,
  BulkReviewExamResultsInput,
} from "@/modules/examinations/schemas/result-review.schema";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const otherCtx: ServiceContext = { userId: "u-x", organizationId: OTHER_ORG };

const store = (name: string) => h.db[name].__store;
const events = () => store("examEvent");
const audits = () => store("auditLog");
const eventsOf = (type: string) =>
  events().filter((e) => (e as { eventType: string }).eventType === type);
const auditFor = (action: string) =>
  audits().find((a) => (a as { action: string }).action === action);
const parseNew = (action: string) =>
  JSON.parse((auditFor(action) as { newValues: string }).newValues) as Record<string, unknown>;

const S_START = new Date("2026-06-10T09:00:00.000Z");
const S_END = new Date("2026-06-10T12:00:00.000Z");

function seedSession(over: Record<string, unknown> = {}): void {
  seed(h.db, "examSession", {
    id: "sess-1", organizationId: ORG, periodId: "per-1", branchId: null, courseId: null,
    courseLevelId: null, levelSubjectId: "ls-1", roomId: null, title: "Exame",
    status: "COMPLETED", startsAt: S_START, endsAt: S_END, capacity: 20, instructions: null,
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
    score: 45, maxScore: 60, normalizedScore: 75, status: "SUBMITTED", resultCode: "SCORED",
    markerId: "marker-1", reviewedById: null, approvedById: null, submittedAt: S_END, reviewedAt: null,
    approvedAt: null, publishedAt: null, invalidatedAt: null, invalidationReason: null,
    remarks: null, resultChecksum: null, currentRevisionId: null, ...over,
  });
}

/** Session (COMPLETED) + candidate + a SUBMITTED result (marker ≠ actor) + PRESENT
 *  attendance — the canonical reviewable fixture. */
function seedReviewable(resultOver: Record<string, unknown> = {}): void {
  seedSession();
  seedCandidate();
  seedResult({ status: "SUBMITTED", markerId: "marker-1", ...resultOver });
  seedAttendance({ status: "PRESENT" });
}

/** As above but the result is already REVIEWED (reviewer ≠ marker ≠ actor). */
function seedApprovable(resultOver: Record<string, unknown> = {}): void {
  seedSession();
  seedCandidate();
  seedResult({
    status: "REVIEWED", markerId: "marker-1", reviewedById: "reviewer-1", reviewedAt: S_END,
    ...resultOver,
  });
  seedAttendance({ status: "PRESENT" });
}

const review = (over: Record<string, unknown> = {}, context = ctx) =>
  new ReviewExamResultCommand({ examResultId: "res-1", ...over }, context).run();

const approve = (over: Record<string, unknown> = {}, context = ctx) =>
  new ApproveExamResultCommand({ examResultId: "res-1", ...over }, context).run();

const returnForCorrection = (over: Record<string, unknown> = {}, context = ctx) =>
  new ReturnExamResultForCorrectionCommand(
    { examResultId: "res-1", reason: "corrigir", ...over },
    context
  ).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Review ────────────────────────────────────────────────────────────────────

describe("ReviewExamResultCommand", () => {
  it("1. SUBMITTED → REVIEWED", async () => {
    seedReviewable();
    const r = await review();
    expect(r.status).toBe("REVIEWED");
    expect(store("examResult")[0].status).toBe("REVIEWED");
  });

  it("2. sets reviewedById / reviewedAt", async () => {
    seedReviewable();
    const r = await review();
    expect(r.reviewedById).toBe("u-1");
    expect(r.reviewedAt).toBeInstanceOf(Date);
    expect(store("examResult")[0].reviewedById).toBe("u-1");
    expect(store("examResult")[0].reviewedAt).toBeInstanceOf(Date);
  });

  it("3. emits exam_result.reviewed event", async () => {
    seedReviewable();
    await review();
    const evt = eventsOf("exam_result.reviewed");
    expect(evt).toHaveLength(1);
    expect((evt[0] as { aggregateType: string }).aggregateType).toBe("EXAM_RESULT");
    expect((evt[0] as { newStatus: string }).newStatus).toBe("REVIEWED");
  });

  it("4. writes an audit log with reviewerId / status", async () => {
    seedReviewable();
    await review({ remarks: "ok" });
    const nv = parseNew("exam_result.reviewed");
    expect(nv.examResultId).toBe("res-1");
    expect(nv.reviewerId).toBe("u-1");
    expect(nv.status).toBe("REVIEWED");
    expect(nv.markerId).toBe("marker-1");
    expect(nv.remarks).toBe("ok");
  });

  it("5. rejects a DRAFT result → RESULT_NOT_SUBMITTED", async () => {
    seedReviewable({ status: "DRAFT" });
    await expect(review()).rejects.toThrowError(/RESULT_NOT_SUBMITTED/);
  });

  it("6. rejects an already-REVIEWED result", async () => {
    seedReviewable({ status: "REVIEWED", reviewedById: "reviewer-1" });
    await expect(review()).rejects.toThrowError(/RESULT_NOT_SUBMITTED/);
  });

  it("7. rejects APPROVED / PUBLISHED / INVALIDATED results", async () => {
    for (const status of ["APPROVED", "PUBLISHED", "INVALIDATED"]) {
      h.db = makeFakeDb();
      seedReviewable({ status });
      await expect(review()).rejects.toThrowError(/RESULT_NOT_SUBMITTED/);
    }
  });

  it("8. self-review by the marker → SELF_REVIEW_NOT_ALLOWED", async () => {
    seedReviewable({ markerId: "u-1" });
    await expect(review()).rejects.toThrowError(/SELF_REVIEW_NOT_ALLOWED/);
    expect(store("examResult")[0].status).toBe("SUBMITTED");
  });

  it("9. attendance corrected after submit (SCORED + ABSENT) → RESULT_STALE", async () => {
    seedSession();
    seedCandidate();
    seedResult({ status: "SUBMITTED", resultCode: "SCORED", score: 45, normalizedScore: 75, markerId: "marker-1" });
    seedAttendance({ status: "ABSENT" });
    await expect(review()).rejects.toThrowError(/RESULT_STALE/);
    expect(store("examResult")[0].status).toBe("SUBMITTED");
  });

  it("10. invalid session state (IN_PROGRESS) → SESSION_NOT_OPEN_FOR_RESULTS", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate();
    seedResult({ status: "SUBMITTED", markerId: "marker-1" });
    seedAttendance({ status: "PRESENT" });
    await expect(review()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("10b. allows a RESULTS_RECORDED session", async () => {
    seedSession({ status: "RESULTS_RECORDED" });
    seedCandidate();
    seedResult({ status: "SUBMITTED", markerId: "marker-1" });
    seedAttendance({ status: "PRESENT" });
    const r = await review();
    expect(r.status).toBe("REVIEWED");
  });

  it("11. cross-tenant result is hidden → NotFound", async () => {
    seedReviewable();
    await expect(review({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("12. a lost race (conditional count 0) aborts — no reviewed event", async () => {
    seedReviewable();
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(review()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
    expect(eventsOf("exam_result.reviewed")).toHaveLength(0);
  });

  it("13. rollback on a failed event write leaves the result SUBMITTED + zero audit", async () => {
    seedReviewable();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(review()).rejects.toThrow(/boom/);
    expect(store("examResult")[0].status).toBe("SUBMITTED");
    expect(audits()).toHaveLength(0);
  });

  it("14. a double review is race-safe (second → RESULT_CONCURRENTLY_CHANGED)", async () => {
    seedReviewable();
    await review();
    // The second attempt, by a different reviewer, now sees REVIEWED (not SUBMITTED).
    await expect(review({}, { userId: "u-2", organizationId: ORG })).rejects.toThrowError(
      /RESULT_NOT_SUBMITTED/
    );
  });

  it("15. requires exams.reviewResults", async () => {
    seedReviewable();
    authState.allow = false;
    await expect(review()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.reviewResults");
  });

  it("16. MARKER_REQUIRED when markerId is null", async () => {
    seedReviewable({ markerId: null });
    await expect(review()).rejects.toThrowError(/MARKER_REQUIRED/);
  });

  it("17. missing result is NotFound", async () => {
    await expect(review()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("18. missing attendance → ATTENDANCE_NOT_MARKED", async () => {
    seedSession();
    seedCandidate();
    seedResult({ status: "SUBMITTED", markerId: "marker-1" });
    await expect(review()).rejects.toThrowError(/ATTENDANCE_NOT_MARKED/);
  });

  it("19. an internally-inconsistent SCORED row (null score) → RESULT_INCOMPLETE", async () => {
    seedSession();
    seedCandidate();
    seedResult({ status: "SUBMITTED", resultCode: "SCORED", score: null, normalizedScore: null, markerId: "marker-1" });
    seedAttendance({ status: "PRESENT" });
    await expect(review()).rejects.toThrowError(/RESULT_INCOMPLETE/);
  });
});

// ─── Approve ─────────────────────────────────────────────────────────────────

describe("ApproveExamResultCommand", () => {
  it("20. REVIEWED → APPROVED", async () => {
    seedApprovable();
    const r = await approve();
    expect(r.status).toBe("APPROVED");
    expect(store("examResult")[0].status).toBe("APPROVED");
  });

  it("21. sets approvedById / approvedAt", async () => {
    seedApprovable();
    const r = await approve();
    expect(r.approvedById).toBe("u-1");
    expect(r.approvedAt).toBeInstanceOf(Date);
    expect(store("examResult")[0].approvedById).toBe("u-1");
    expect(store("examResult")[0].approvedAt).toBeInstanceOf(Date);
  });

  it("22. emits exam_result.approved event", async () => {
    seedApprovable();
    await approve();
    const evt = eventsOf("exam_result.approved");
    expect(evt).toHaveLength(1);
    expect((evt[0] as { newStatus: string }).newStatus).toBe("APPROVED");
  });

  it("23. writes an audit log with approverId / reviewerId / status", async () => {
    seedApprovable();
    await approve();
    const nv = parseNew("exam_result.approved");
    expect(nv.approverId).toBe("u-1");
    expect(nv.reviewerId).toBe("reviewer-1");
    expect(nv.markerId).toBe("marker-1");
    expect(nv.status).toBe("APPROVED");
  });

  it("24. rejects a SUBMITTED result → RESULT_NOT_REVIEWED (direct SUBMITTED→APPROVED blocked)", async () => {
    seedApprovable({ status: "SUBMITTED", reviewedById: null, reviewedAt: null });
    await expect(approve()).rejects.toThrowError(/RESULT_NOT_REVIEWED/);
  });

  it("25. rejects DRAFT / APPROVED / PUBLISHED / INVALIDATED results", async () => {
    for (const status of ["DRAFT", "APPROVED", "PUBLISHED", "INVALIDATED"]) {
      h.db = makeFakeDb();
      seedApprovable({ status });
      await expect(approve()).rejects.toThrowError(/RESULT_NOT_REVIEWED/);
    }
  });

  it("26. approver == marker → APPROVER_IS_MARKER", async () => {
    seedApprovable({ markerId: "u-1" });
    await expect(approve()).rejects.toThrowError(/APPROVER_IS_MARKER/);
  });

  it("27. approver == reviewer → APPROVER_IS_REVIEWER", async () => {
    seedApprovable({ reviewedById: "u-1" });
    await expect(approve()).rejects.toThrowError(/APPROVER_IS_REVIEWER/);
  });

  it("28. REVIEWER_REQUIRED when reviewedById is null", async () => {
    seedApprovable({ reviewedById: null, reviewedAt: null });
    await expect(approve()).rejects.toThrowError(/REVIEWER_REQUIRED/);
  });

  it("29. attendance mismatch after review → RESULT_STALE", async () => {
    seedSession();
    seedCandidate();
    seedResult({
      status: "REVIEWED", resultCode: "SCORED", score: 45, normalizedScore: 75,
      markerId: "marker-1", reviewedById: "reviewer-1",
    });
    seedAttendance({ status: "ABSENT" });
    await expect(approve()).rejects.toThrowError(/RESULT_STALE/);
    expect(store("examResult")[0].status).toBe("REVIEWED");
  });

  it("30. invalid session state (IN_PROGRESS) → SESSION_NOT_OPEN_FOR_RESULTS", async () => {
    seedSession({ status: "IN_PROGRESS" });
    seedCandidate();
    seedResult({ status: "REVIEWED", markerId: "marker-1", reviewedById: "reviewer-1" });
    seedAttendance({ status: "PRESENT" });
    await expect(approve()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_RESULTS/);
  });

  it("31. a lost race (conditional count 0) aborts — no approved event", async () => {
    seedApprovable();
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(approve()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
    expect(eventsOf("exam_result.approved")).toHaveLength(0);
  });

  it("32. rollback on a failed event write leaves the result REVIEWED + zero audit", async () => {
    seedApprovable();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(approve()).rejects.toThrow(/boom/);
    expect(store("examResult")[0].status).toBe("REVIEWED");
    expect(audits()).toHaveLength(0);
  });

  it("33. a double approve is race-safe (second → RESULT_NOT_REVIEWED)", async () => {
    seedApprovable();
    await approve();
    await expect(approve({}, { userId: "u-2", organizationId: ORG })).rejects.toThrowError(
      /RESULT_NOT_REVIEWED/
    );
  });

  it("34. requires exams.approveResults", async () => {
    seedApprovable();
    authState.allow = false;
    await expect(approve()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.approveResults");
  });

  it("35. missing result is NotFound", async () => {
    await expect(approve()).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Return for correction ─────────────────────────────────────────────────────

describe("ReturnExamResultForCorrectionCommand", () => {
  it("36. SUBMITTED → DRAFT", async () => {
    seedReviewable();
    const r = await returnForCorrection();
    expect(r.status).toBe("DRAFT");
    expect(store("examResult")[0].status).toBe("DRAFT");
  });

  it("37. REVIEWED → DRAFT", async () => {
    seedApprovable();
    const r = await returnForCorrection();
    expect(r.status).toBe("DRAFT");
    expect(store("examResult")[0].status).toBe("DRAFT");
  });

  it("38. reason is required (schema — omitting reason → ValidationError)", async () => {
    seedReviewable();
    await expect(
      new ReturnExamResultForCorrectionCommand({ examResultId: "res-1" } as never, ctx).run()
    ).rejects.toThrowError(/inválidos/i);
    expect(store("examResult")[0].status).toBe("SUBMITTED");
  });

  it("39. returning from REVIEWED clears reviewedById / reviewedAt", async () => {
    seedApprovable();
    await returnForCorrection();
    expect(store("examResult")[0].reviewedById).toBeNull();
    expect(store("examResult")[0].reviewedAt).toBeNull();
  });

  it("40. preserves markerId", async () => {
    seedReviewable({ markerId: "marker-9" });
    await returnForCorrection();
    expect(store("examResult")[0].markerId).toBe("marker-9");
  });

  it("41. preserves score / resultCode", async () => {
    seedReviewable({ score: 45, maxScore: 60, normalizedScore: 75, resultCode: "SCORED" });
    await returnForCorrection();
    const row = store("examResult")[0];
    expect(row.score).toBe(45);
    expect(row.normalizedScore).toBe(75);
    expect(row.resultCode).toBe("SCORED");
  });

  it("42. rejects a DRAFT result → RESULT_NOT_RETURNABLE", async () => {
    seedReviewable({ status: "DRAFT" });
    await expect(returnForCorrection()).rejects.toThrowError(/RESULT_NOT_RETURNABLE/);
  });

  it("43. rejects APPROVED / PUBLISHED / INVALIDATED results", async () => {
    for (const status of ["APPROVED", "PUBLISHED", "INVALIDATED"]) {
      h.db = makeFakeDb();
      seedReviewable({ status });
      await expect(returnForCorrection()).rejects.toThrowError(/RESULT_NOT_RETURNABLE/);
    }
  });

  it("44. a lost race (conditional count 0) aborts — no returned event", async () => {
    seedReviewable();
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(returnForCorrection()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
    expect(eventsOf("exam_result.returned_for_correction")).toHaveLength(0);
  });

  it("45. event + audit transactional (rollback clean)", async () => {
    seedReviewable();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(returnForCorrection()).rejects.toThrow(/boom/);
    expect(store("examResult")[0].status).toBe("SUBMITTED");
    expect(audits()).toHaveLength(0);
  });

  it("46. emits exam_result.returned_for_correction event + audit reason", async () => {
    seedReviewable();
    await returnForCorrection({ reason: "erro de lançamento" });
    const evt = eventsOf("exam_result.returned_for_correction");
    expect(evt).toHaveLength(1);
    expect((evt[0] as { newStatus: string }).newStatus).toBe("DRAFT");
    const nv = parseNew("exam_result.returned_for_correction");
    expect(nv.reason).toBe("erro de lançamento");
    expect(nv.status).toBe("DRAFT");
  });

  it("47. requires exams.returnResultsForCorrection", async () => {
    seedReviewable();
    authState.allow = false;
    await expect(returnForCorrection()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.returnResultsForCorrection");
  });

  it("48. missing result is NotFound", async () => {
    await expect(returnForCorrection()).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Separation / invariants ─────────────────────────────────────────────────

describe("separation & invariants", () => {
  it("49. actor ids are never taken from input (review — reviewedById key rejected)", async () => {
    seedReviewable();
    await expect(
      new ReviewExamResultCommand(
        { examResultId: "res-1", reviewedById: "hacker" } as never,
        ctx
      ).run()
    ).rejects.toThrowError(/inválidos/i);
  });

  it("50. actor ids are never taken from input (approve — approverId key rejected)", async () => {
    seedApprovable();
    await expect(
      new ApproveExamResultCommand(
        { examResultId: "res-1", approverId: "hacker" } as never,
        ctx
      ).run()
    ).rejects.toThrowError(/inválidos/i);
  });

  it("51. review does not edit score / normalizedScore / resultCode", async () => {
    seedReviewable({ score: 45, maxScore: 60, normalizedScore: 75, resultCode: "SCORED" });
    await review();
    const row = store("examResult")[0];
    expect(row.score).toBe(45);
    expect(row.normalizedScore).toBe(75);
    expect(row.resultCode).toBe("SCORED");
  });

  it("52. approve does not edit score / normalizedScore / resultCode", async () => {
    seedApprovable({ score: 45, maxScore: 60, normalizedScore: 75, resultCode: "SCORED" });
    await approve();
    const row = store("examResult")[0];
    expect(row.score).toBe(45);
    expect(row.normalizedScore).toBe(75);
    expect(row.resultCode).toBe("SCORED");
  });

  it("53. review / approve / return never mutate the session status", async () => {
    seedReviewable();
    await review();
    expect(store("examSession")[0].status).toBe("COMPLETED");

    h.db = makeFakeDb();
    seedApprovable();
    await approve();
    expect(store("examSession")[0].status).toBe("COMPLETED");

    h.db = makeFakeDb();
    seedReviewable();
    await returnForCorrection();
    expect(store("examSession")[0].status).toBe("COMPLETED");
  });

  it("54. review / approve / return never mutate the candidate status", async () => {
    seedReviewable();
    await review();
    expect(store("examCandidate")[0].status).toBe("REGISTERED");

    h.db = makeFakeDb();
    seedApprovable();
    await approve();
    expect(store("examCandidate")[0].status).toBe("REGISTERED");

    h.db = makeFakeDb();
    seedReviewable();
    await returnForCorrection();
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
  });

  it("55. writes NO StudentSubject/Level/Course progress row (records a fact only)", async () => {
    seedReviewable();
    await review();
    h.db = makeFakeDb();
    seedApprovable();
    await approve();
    expect(store("studentSubjectProgress")).toHaveLength(0);
    expect(store("studentLevelProgress")).toHaveLength(0);
    expect(store("studentCourseProgress")).toHaveLength(0);
  });
});

// ─── Bulk review ─────────────────────────────────────────────────────────────

describe("BulkReviewExamResultsCommand", () => {
  const bulk = (items: Record<string, unknown>[], over: Record<string, unknown> = {}, context = ctx) =>
    new BulkReviewExamResultsCommand(
      { examSessionId: "sess-1", items: items as BulkReviewExamResultsInput["items"], ...over },
      context
    ).run();

  function seedTwoReviewable(): void {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seedResult({ id: "res-1", examCandidateId: "cand-1", status: "SUBMITTED", markerId: "marker-1" });
    seedResult({ id: "res-2", examCandidateId: "cand-2", studentId: "stu-2", status: "SUBMITTED", markerId: "marker-1" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    seed(h.db, "examAttendance", { id: "a2", organizationId: ORG, examCandidateId: "cand-2", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
  }

  it("56. reviews multiple results (all ok)", async () => {
    seedTwoReviewable();
    const r = await bulk([{ examResultId: "res-1" }, { examResultId: "res-2" }]);
    expect(r.total).toBe(2);
    expect(r.succeeded).toBe(2);
    expect(r.failed).toBe(0);
    expect(store("examResult").every((x) => x.status === "REVIEWED")).toBe(true);
  });

  it("57. delegates to the single Review command once per item", async () => {
    seedTwoReviewable();
    const spy = vi.spyOn(ReviewExamResultCommand.prototype, "run").mockResolvedValue({
      examResultId: "x", status: "REVIEWED", reviewedById: "u-1", reviewedAt: new Date(),
    });
    await bulk([{ examResultId: "res-1" }, { examResultId: "res-2" }]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("58. a result from another session is failed RESULT_NOT_IN_SESSION (never delegated)", async () => {
    seedSession(); // sess-1
    seedCandidate({ id: "cand-9", examSessionId: "sess-OTHER", studentId: "stu-9" });
    seedResult({ id: "res-9", examCandidateId: "cand-9", status: "SUBMITTED", markerId: "marker-1" });
    const spy = vi.spyOn(ReviewExamResultCommand.prototype, "run");
    const r = await bulk([{ examResultId: "res-9" }]);
    expect(r.failed).toBe(1);
    expect(r.items[0].code).toBe("RESULT_NOT_IN_SESSION");
    expect(spy).not.toHaveBeenCalled();
  });

  it("59. counts invariant with a failure and a skip (stopOnFailure)", async () => {
    seedTwoReviewable();
    const r = await bulk(
      [{ examResultId: "missing" }, { examResultId: "res-1" }],
      { stopOnFailure: true }
    );
    expect(r.total).toBe(r.succeeded + r.failed + r.skipped);
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("60. requires exams.reviewResults up-front (denied → no delegation)", async () => {
    seedTwoReviewable();
    authState.allow = false;
    const spy = vi.spyOn(ReviewExamResultCommand.prototype, "run");
    await expect(bulk([{ examResultId: "res-1" }])).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.reviewResults");
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── Bulk approve ─────────────────────────────────────────────────────────────

describe("BulkApproveExamResultsCommand", () => {
  const bulk = (items: Record<string, unknown>[], over: Record<string, unknown> = {}, context = ctx) =>
    new BulkApproveExamResultsCommand(
      { examSessionId: "sess-1", items: items as BulkApproveExamResultsInput["items"], ...over },
      context
    ).run();

  function seedTwoApprovable(): void {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seedResult({ id: "res-1", examCandidateId: "cand-1", status: "REVIEWED", markerId: "marker-1", reviewedById: "reviewer-1" });
    seedResult({ id: "res-2", examCandidateId: "cand-2", studentId: "stu-2", status: "REVIEWED", markerId: "marker-1", reviewedById: "reviewer-1" });
    seed(h.db, "examAttendance", { id: "a1", organizationId: ORG, examCandidateId: "cand-1", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
    seed(h.db, "examAttendance", { id: "a2", organizationId: ORG, examCandidateId: "cand-2", status: "PRESENT", checkedInAt: null, markedAt: S_START, markedById: "u-0", remarks: null });
  }

  it("61. approves multiple results (all ok)", async () => {
    seedTwoApprovable();
    const r = await bulk([{ examResultId: "res-1" }, { examResultId: "res-2" }]);
    expect(r.succeeded).toBe(2);
    expect(store("examResult").every((x) => x.status === "APPROVED")).toBe(true);
  });

  it("62. delegates to the single Approve command once per item", async () => {
    seedTwoApprovable();
    const spy = vi.spyOn(ApproveExamResultCommand.prototype, "run").mockResolvedValue({
      examResultId: "x", status: "APPROVED", approvedById: "u-1", approvedAt: new Date(),
    });
    await bulk([{ examResultId: "res-1" }, { examResultId: "res-2" }]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("63. a result from another session is failed RESULT_NOT_IN_SESSION (never delegated)", async () => {
    seedSession();
    seedCandidate({ id: "cand-9", examSessionId: "sess-OTHER", studentId: "stu-9" });
    seedResult({ id: "res-9", examCandidateId: "cand-9", status: "REVIEWED", markerId: "marker-1", reviewedById: "reviewer-1" });
    const spy = vi.spyOn(ApproveExamResultCommand.prototype, "run");
    const r = await bulk([{ examResultId: "res-9" }]);
    expect(r.failed).toBe(1);
    expect(r.items[0].code).toBe("RESULT_NOT_IN_SESSION");
    expect(spy).not.toHaveBeenCalled();
  });

  it("64. requires exams.approveResults up-front (denied → no delegation)", async () => {
    seedTwoApprovable();
    authState.allow = false;
    const spy = vi.spyOn(ApproveExamResultCommand.prototype, "run");
    await expect(bulk([{ examResultId: "res-1" }])).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.approveResults");
    expect(spy).not.toHaveBeenCalled();
  });
});
