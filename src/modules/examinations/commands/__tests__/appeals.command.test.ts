import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 10 APPEALS & RESULT-REVISION COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives create / review / approve / reject / withdraw against the rollback-capable
// in-memory fake DB. These prove the Examination Engine treats a post-publication
// correction as an APPEND-ONLY ExamResultRevision (never a rewrite of the ExamResult):
// exactly one CURRENT revision per result (clear-then-create under the filtered-unique
// index), the ExamResult stays immutable except its `currentRevisionId` pointer, the
// official result is ExamResult + currentRevision (revised score + purely-recomputed
// normalized), student ownership is enforced server-side via the acting Student, and
// every mutation writes ExamEvent + AuditLog in ONE tx (no bus). `@/server/db` (→ fake),
// `@/server/auth/rbac` (allow/deny + recorded perms) and the students service
// (`getStudentByUserId`) are the only mocks.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true, checked: [] as string[] }));
const studentState = vi.hoisted(() => ({ student: null as { id: string } | null }));

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
vi.mock("@/modules/students/services/student.service", () => ({
  getStudentByUserId: vi.fn(async () => studentState.student),
}));

import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  ApproveExamAppealCommand,
  CreateExamAppealCommand,
  RejectExamAppealCommand,
  ReviewExamAppealCommand,
  WithdrawExamAppealCommand,
} from "../appeals.commands";
import { resolveOfficialExamResult } from "../appeals-shared";
import { getOfficialExamResult } from "../../services/official-exam-result.service";
import type {
  ExamResultRecord,
  ExamResultRevisionRecord,
} from "../../types/repository";

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
const revisions = () => store("examResultRevision");
const currentRevisions = () => revisions().filter((r) => (r as { isCurrent: boolean }).isCurrent);

const T = new Date("2026-06-10T12:00:00.000Z");

function seedResult(over: Record<string, unknown> = {}): void {
  seed(h.db, "examResult", {
    id: "res-1", organizationId: ORG, examCandidateId: "cand-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1",
    score: 45, maxScore: 60, normalizedScore: 75, status: "PUBLISHED", resultCode: "SCORED",
    markerId: "marker-1", reviewedById: "reviewer-1", approvedById: "approver-1", submittedAt: T,
    reviewedAt: T, approvedAt: T, publishedAt: T, invalidatedAt: null, invalidationReason: null,
    remarks: null, resultChecksum: null, currentRevisionId: null, ...over,
  });
}

// The first appeal `createExamAppeal` inserts into the fresh fake DB is assigned the
// deterministic id `examAppeal-1` (the fake's per-model sequence); the review /
// approve / reject / withdraw wrappers default to it so a plain `await create()`
// followed by e.g. `await review()` targets that same appeal.
const APPEAL_ID = "examAppeal-1";

const create = (over: Record<string, unknown> = {}, context = ctx) =>
  new CreateExamAppealCommand({ examResultId: "res-1", reason: "revisão de nota", ...over }, context).run();
const review = (over: Record<string, unknown> = {}, context = ctx) =>
  new ReviewExamAppealCommand({ appealId: APPEAL_ID, ...over }, context).run();
const approve = (over: Record<string, unknown> = {}, context = ctx) =>
  new ApproveExamAppealCommand(
    { appealId: APPEAL_ID, revisedScore: 50, reason: "erro de correção", ...over },
    context
  ).run();
const reject = (over: Record<string, unknown> = {}, context = ctx) =>
  new RejectExamAppealCommand({ appealId: APPEAL_ID, reason: "sem fundamento", ...over }, context).run();
const withdraw = (over: Record<string, unknown> = {}, context = ctx) =>
  new WithdrawExamAppealCommand({ appealId: APPEAL_ID, ...over }, context).run();

/** Drive an appeal from create → UNDER_REVIEW (admin acting). Returns the appealId. */
async function seedUnderReview(): Promise<string> {
  const c = await create();
  await review({ appealId: c.appealId });
  return c.appealId;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
  studentState.student = null; // admin by default
});
afterEach(() => vi.restoreAllMocks());

// ─── Create ────────────────────────────────────────────────────────────────────

describe("CreateExamAppealCommand", () => {
  it("1. creates a PENDING appeal for a PUBLISHED result", async () => {
    seedResult();
    const r = await create();
    expect(r.status).toBe("PENDING");
    expect(store("examAppeal")).toHaveLength(1);
    expect(store("examAppeal")[0].status).toBe("PENDING");
  });

  it("2. a smuggled studentId key is rejected by the strict schema", async () => {
    seedResult();
    await expect(create({ studentId: "hacker" } as never)).rejects.toThrowError(/inválidos/i);
    expect(store("examAppeal")).toHaveLength(0);
  });

  it("3. requestedById is the acting user, studentId is the owner", async () => {
    seedResult();
    await create();
    const row = store("examAppeal")[0];
    expect(row.requestedById).toBe("u-1");
    expect(row.studentId).toBe("stu-1");
  });

  it("4. emits exam_appeal.created + writes audit", async () => {
    seedResult();
    await create();
    expect(eventsOf("exam_appeal.created")).toHaveLength(1);
    expect(auditFor("exam_appeal.created")).toBeTruthy();
    const nv = parseNew("exam_appeal.created");
    expect(nv.examResultId).toBe("res-1");
    expect(nv.requestedById).toBe("u-1");
  });

  it("5. rejects a non-PUBLISHED (APPROVED) result → APPEAL_RESULT_NOT_PUBLISHED", async () => {
    seedResult({ status: "APPROVED" });
    await expect(create()).rejects.toThrowError(/APPEAL_RESULT_NOT_PUBLISHED/);
  });

  it("6. rejects a DRAFT result → APPEAL_RESULT_NOT_PUBLISHED", async () => {
    seedResult({ status: "DRAFT" });
    await expect(create()).rejects.toThrowError(/APPEAL_RESULT_NOT_PUBLISHED/);
  });

  it("7. blocks a second active appeal → APPEAL_ALREADY_EXISTS", async () => {
    seedResult();
    await create();
    await expect(create()).rejects.toThrowError(/APPEAL_ALREADY_EXISTS/);
  });

  it("8. an UNDER_REVIEW appeal also blocks a new one → APPEAL_ALREADY_EXISTS", async () => {
    seedResult();
    await seedUnderReview();
    await expect(create()).rejects.toThrowError(/APPEAL_ALREADY_EXISTS/);
  });

  it("9. missing result is NotFound", async () => {
    await expect(create()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("10. cross-tenant result is hidden → NotFound", async () => {
    seedResult();
    studentState.student = null;
    await expect(create({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("11. a linked student may appeal their OWN result", async () => {
    seedResult();
    studentState.student = { id: "stu-1" };
    const r = await create();
    expect(r.status).toBe("PENDING");
  });

  it("12. a linked student appealing ANOTHER student's result → AuthorizationError", async () => {
    seedResult();
    studentState.student = { id: "stu-2" };
    await expect(create()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("13. an admin (no linked student) may appeal any result", async () => {
    seedResult();
    studentState.student = null;
    const r = await create();
    expect(r.status).toBe("PENDING");
  });

  it("14. reason is required (empty → ValidationError)", async () => {
    seedResult();
    await expect(create({ reason: "" })).rejects.toThrowError(/inválidos/i);
  });

  it("15. requires exams.createAppeal", async () => {
    seedResult();
    authState.allow = false;
    await expect(create()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.createAppeal");
  });

  it("16. rollback on a failed event write leaves no appeal", async () => {
    seedResult();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(create()).rejects.toThrow(/boom/);
    expect(store("examAppeal")).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });
});

// ─── Review ────────────────────────────────────────────────────────────────────

describe("ReviewExamAppealCommand", () => {
  it("17. PENDING → UNDER_REVIEW", async () => {
    seedResult();
    await create();
    const r = await review();
    expect(r.status).toBe("UNDER_REVIEW");
    expect(store("examAppeal")[0].status).toBe("UNDER_REVIEW");
  });

  it("18. emits exam_appeal.reviewed + audit", async () => {
    seedResult();
    await create();
    await review();
    expect(eventsOf("exam_appeal.reviewed")).toHaveLength(1);
    expect(auditFor("exam_appeal.reviewed")).toBeTruthy();
  });

  it("19. a non-PENDING appeal → APPEAL_NOT_PENDING", async () => {
    seedResult();
    await seedUnderReview();
    await expect(review()).rejects.toThrowError(/APPEAL_NOT_PENDING/);
  });

  it("20. missing appeal is NotFound", async () => {
    await expect(review()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("21. cross-tenant appeal is hidden → NotFound", async () => {
    seedResult();
    await create();
    await expect(review({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("22. requires exams.reviewAppeal", async () => {
    seedResult();
    await create();
    authState.allow = false;
    await expect(review()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.reviewAppeal");
  });

  it("23. conditional count 0 aborts → APPEAL_CONCURRENTLY_CHANGED", async () => {
    seedResult();
    await create();
    h.db.examAppeal.updateMany = async () => ({ count: 0 });
    await expect(review()).rejects.toThrowError(/APPEAL_CONCURRENTLY_CHANGED/);
  });

  it("24. rollback on a failed event write leaves the appeal PENDING", async () => {
    seedResult();
    await create();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(review()).rejects.toThrow(/boom/);
    expect(store("examAppeal")[0].status).toBe("PENDING");
  });
});

// ─── Approve ─────────────────────────────────────────────────────────────────

describe("ApproveExamAppealCommand", () => {
  it("25. UNDER_REVIEW → APPROVED, creates a CURRENT revision", async () => {
    seedResult();
    await seedUnderReview();
    const r = await approve();
    expect(r.status).toBe("APPROVED");
    expect(store("examAppeal")[0].status).toBe("APPROVED");
    expect(revisions()).toHaveLength(1);
    expect(revisions()[0].isCurrent).toBe(true);
    expect(revisions()[0].status).toBe("CURRENT");
  });

  it("26. the revision is revisionNumber 1, sourceType APPEAL", async () => {
    seedResult();
    await seedUnderReview();
    await approve();
    const rev = revisions()[0];
    expect(rev.revisionNumber).toBe(1);
    expect(rev.sourceType).toBe("APPEAL");
    expect(rev.revisedScore).toBe(50);
    expect(rev.previousScore).toBe(45);
  });

  it("27. repoints the result's currentRevisionId (ONLY ExamResult mutation)", async () => {
    seedResult();
    await seedUnderReview();
    const r = await approve();
    expect(store("examResult")[0].currentRevisionId).toBe(r.revisionId);
  });

  it("28. NO ExamResult content mutation (score/normalized/resultCode/status/publishedAt intact)", async () => {
    seedResult();
    await seedUnderReview();
    await approve();
    const row = store("examResult")[0];
    expect(row.score).toBe(45);
    expect(row.normalizedScore).toBe(75);
    expect(row.resultCode).toBe("SCORED");
    expect(row.status).toBe("PUBLISHED");
    expect(row.publishedAt).toBe(T);
    expect(row.markerId).toBe("marker-1");
    expect(row.reviewedById).toBe("reviewer-1");
    expect(row.approvedById).toBe("approver-1");
  });

  it("29. stamps the appeal decision (decision/decidedBy/decidedAt/decisionReason)", async () => {
    seedResult();
    await seedUnderReview();
    await approve({ reason: "prova mal corrigida" });
    const row = store("examAppeal")[0];
    expect(row.decision).toBe("APPROVED");
    expect(row.decisionReason).toBe("prova mal corrigida");
    expect(row.decidedById).toBe("u-1");
    expect(row.decidedAt).toBeInstanceOf(Date);
  });

  it("30. emits exam_result.revision_created + exam_appeal.approved", async () => {
    seedResult();
    await seedUnderReview();
    await approve();
    expect(eventsOf("exam_result.revision_created")).toHaveLength(1);
    expect(eventsOf("exam_appeal.approved")).toHaveLength(1);
    const nv = parseNew("exam_result.revision_created");
    expect(nv.revisionNumber).toBe(1);
    expect(nv.revisedScore).toBe(50);
    expect(nv.sourceType).toBe("APPEAL");
    const av = parseNew("exam_appeal.approved");
    expect(av.revisionId).toBeTruthy();
  });

  it("31. the revision-created event uses aggregate EXAM_RESULT_REVISION", async () => {
    seedResult();
    await seedUnderReview();
    await approve();
    const evt = eventsOf("exam_result.revision_created");
    expect((evt[0] as { aggregateType: string }).aggregateType).toBe("EXAM_RESULT_REVISION");
  });

  it("32. a non-UNDER_REVIEW (PENDING) appeal → APPEAL_NOT_UNDER_REVIEW", async () => {
    seedResult();
    await create();
    await expect(approve()).rejects.toThrowError(/APPEAL_NOT_UNDER_REVIEW/);
  });

  it("33. rejects a revisedScore above maxScore → SCORE_OUT_OF_RANGE", async () => {
    seedResult();
    await seedUnderReview();
    await expect(approve({ revisedScore: 61 })).rejects.toThrowError(/SCORE_OUT_OF_RANGE/);
  });

  it("34. rejects a negative revisedScore → SCORE_OUT_OF_RANGE", async () => {
    seedResult();
    await seedUnderReview();
    await expect(approve({ revisedScore: -1 })).rejects.toThrowError(/SCORE_OUT_OF_RANGE/);
  });

  it("35. accepts revisedScore exactly at maxScore boundary", async () => {
    seedResult();
    await seedUnderReview();
    const r = await approve({ revisedScore: 60 });
    expect(r.status).toBe("APPROVED");
    expect(revisions()[0].revisedScore).toBe(60);
  });

  it("36. accepts revisedScore 0 boundary", async () => {
    seedResult();
    await seedUnderReview();
    const r = await approve({ revisedScore: 0 });
    expect(r.status).toBe("APPROVED");
    expect(revisions()[0].revisedScore).toBe(0);
  });

  it("37. rejects when result maxScore is not positive → MAX_SCORE_INVALID", async () => {
    seedResult({ maxScore: 0 });
    await seedUnderReview();
    await expect(approve({ revisedScore: 0 })).rejects.toThrowError(/MAX_SCORE_INVALID/);
  });

  it("38. reason is required → ValidationError", async () => {
    seedResult();
    await seedUnderReview();
    await expect(approve({ reason: "" })).rejects.toThrowError(/inválidos/i);
  });

  it("39. result no longer PUBLISHED → APPEAL_RESULT_NOT_PUBLISHED", async () => {
    seedResult();
    await seedUnderReview();
    store("examResult")[0].status = "APPROVED"; // regressed after review opened
    await expect(approve()).rejects.toThrowError(/APPEAL_RESULT_NOT_PUBLISHED/);
  });

  it("40. missing appeal is NotFound", async () => {
    await expect(approve()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("41. cross-tenant appeal is hidden → NotFound", async () => {
    seedResult();
    await seedUnderReview();
    await expect(approve({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("42. requires exams.approveAppeal", async () => {
    seedResult();
    await seedUnderReview();
    authState.allow = false;
    await expect(approve()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.approveAppeal");
  });

  it("43. currentRevisionId update count 0 aborts → RESULT_CONCURRENTLY_CHANGED", async () => {
    seedResult();
    await seedUnderReview();
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(approve()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
  });

  it("44. rollback on a failed event write leaves NOTHING (no revision, result untouched)", async () => {
    seedResult();
    await seedUnderReview();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(approve()).rejects.toThrow(/boom/);
    expect(revisions()).toHaveLength(0);
    expect(store("examResult")[0].currentRevisionId).toBeNull();
    expect(store("examAppeal")[0].status).toBe("UNDER_REVIEW");
  });
});

// ─── Append-only / single-current invariants ──────────────────────────────────

describe("append-only revision invariants", () => {
  async function approveTwice(): Promise<void> {
    seedResult();
    // first appeal → approve (rev 1)
    await seedUnderReview();
    await approve({ revisedScore: 50 });
    // second appeal on the same (still PUBLISHED) result → approve (rev 2)
    const c2 = await create();
    await review({ appealId: c2.appealId });
    await approve({ appealId: c2.appealId, revisedScore: 55 });
  }

  it("45. approve twice → 2 revision rows, numbered 1 then 2", async () => {
    await approveTwice();
    expect(revisions()).toHaveLength(2);
    const nums = revisions().map((r) => (r as { revisionNumber: number }).revisionNumber).sort();
    expect(nums).toEqual([1, 2]);
  });

  it("46. exactly one CURRENT revision after two approvals", async () => {
    await approveTwice();
    expect(currentRevisions()).toHaveLength(1);
  });

  it("47. only the newest revision is CURRENT (rev 2), previous flipped false", async () => {
    await approveTwice();
    const rev1 = revisions().find((r) => (r as { revisionNumber: number }).revisionNumber === 1)!;
    const rev2 = revisions().find((r) => (r as { revisionNumber: number }).revisionNumber === 2)!;
    expect(rev1.isCurrent).toBe(false);
    expect(rev2.isCurrent).toBe(true);
  });

  it("48. the previous revision's score fields are unchanged (append-only)", async () => {
    await approveTwice();
    const rev1 = revisions().find((r) => (r as { revisionNumber: number }).revisionNumber === 1)!;
    expect(rev1.revisedScore).toBe(50);
    expect(rev1.previousScore).toBe(45);
  });

  it("49. rev 2 previousScore chains from rev 1's revisedScore", async () => {
    await approveTwice();
    const rev2 = revisions().find((r) => (r as { revisionNumber: number }).revisionNumber === 2)!;
    expect(rev2.previousScore).toBe(50);
    expect(rev2.revisedScore).toBe(55);
  });

  it("50. the result's currentRevisionId points at the newest (rev 2)", async () => {
    await approveTwice();
    const rev2 = revisions().find((r) => (r as { revisionNumber: number }).revisionNumber === 2)!;
    expect(store("examResult")[0].currentRevisionId).toBe(rev2.id);
  });

  it("51. two revision_created events emitted across the two approvals", async () => {
    await approveTwice();
    expect(eventsOf("exam_result.revision_created")).toHaveLength(2);
  });
});

// ─── Reject ────────────────────────────────────────────────────────────────────

describe("RejectExamAppealCommand", () => {
  it("52. UNDER_REVIEW → REJECTED, NO revision, NO result mutation", async () => {
    seedResult();
    await seedUnderReview();
    const r = await reject();
    expect(r.status).toBe("REJECTED");
    expect(store("examAppeal")[0].status).toBe("REJECTED");
    expect(revisions()).toHaveLength(0);
    expect(store("examResult")[0].currentRevisionId).toBeNull();
    expect(store("examResult")[0].score).toBe(45);
  });

  it("53. stamps the decision + emits exam_appeal.rejected", async () => {
    seedResult();
    await seedUnderReview();
    await reject({ reason: "recurso sem base" });
    const row = store("examAppeal")[0];
    expect(row.decision).toBe("REJECTED");
    expect(row.decisionReason).toBe("recurso sem base");
    expect(row.decidedById).toBe("u-1");
    expect(eventsOf("exam_appeal.rejected")).toHaveLength(1);
  });

  it("54. a non-UNDER_REVIEW (PENDING) appeal → APPEAL_NOT_UNDER_REVIEW", async () => {
    seedResult();
    await create();
    await expect(reject()).rejects.toThrowError(/APPEAL_NOT_UNDER_REVIEW/);
  });

  it("55. reason is required → ValidationError", async () => {
    seedResult();
    await seedUnderReview();
    await expect(reject({ reason: "" })).rejects.toThrowError(/inválidos/i);
  });

  it("56. missing appeal is NotFound", async () => {
    await expect(reject()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("57. cross-tenant appeal is hidden → NotFound", async () => {
    seedResult();
    await seedUnderReview();
    await expect(reject({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("58. requires exams.rejectAppeal", async () => {
    seedResult();
    await seedUnderReview();
    authState.allow = false;
    await expect(reject()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.rejectAppeal");
  });

  it("59. conditional count 0 aborts → APPEAL_CONCURRENTLY_CHANGED", async () => {
    seedResult();
    await seedUnderReview();
    h.db.examAppeal.updateMany = async () => ({ count: 0 });
    await expect(reject()).rejects.toThrowError(/APPEAL_CONCURRENTLY_CHANGED/);
  });
});

// ─── Withdraw ────────────────────────────────────────────────────────────────

describe("WithdrawExamAppealCommand", () => {
  it("60. PENDING → WITHDRAWN (stamps closedAt)", async () => {
    seedResult();
    await create();
    const r = await withdraw();
    expect(r.status).toBe("WITHDRAWN");
    expect(store("examAppeal")[0].status).toBe("WITHDRAWN");
    expect(store("examAppeal")[0].closedAt).toBeInstanceOf(Date);
  });

  it("61. emits exam_appeal.withdrawn + audit", async () => {
    seedResult();
    await create();
    await withdraw({ reason: "resolvido informalmente" });
    expect(eventsOf("exam_appeal.withdrawn")).toHaveLength(1);
    const nv = parseNew("exam_appeal.withdrawn");
    expect(nv.reason).toBe("resolvido informalmente");
  });

  it("62. a non-PENDING (UNDER_REVIEW) appeal → APPEAL_NOT_PENDING", async () => {
    seedResult();
    await seedUnderReview();
    await expect(withdraw()).rejects.toThrowError(/APPEAL_NOT_PENDING/);
  });

  it("63. a linked student may withdraw their OWN appeal", async () => {
    seedResult();
    await create();
    studentState.student = { id: "stu-1" };
    const r = await withdraw();
    expect(r.status).toBe("WITHDRAWN");
  });

  it("64. a linked student withdrawing ANOTHER student's appeal → AuthorizationError", async () => {
    seedResult();
    await create();
    studentState.student = { id: "stu-2" };
    await expect(withdraw()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("65. missing appeal is NotFound", async () => {
    await expect(withdraw()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("66. cross-tenant appeal is hidden → NotFound", async () => {
    seedResult();
    await create();
    await expect(withdraw({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("67. requires exams.withdrawAppeal", async () => {
    seedResult();
    await create();
    authState.allow = false;
    await expect(withdraw()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.withdrawAppeal");
  });

  it("68. conditional count 0 aborts → APPEAL_CONCURRENTLY_CHANGED", async () => {
    seedResult();
    await create();
    h.db.examAppeal.updateMany = async () => ({ count: 0 });
    await expect(withdraw()).rejects.toThrowError(/APPEAL_CONCURRENTLY_CHANGED/);
  });

  it("69. can create a fresh appeal again after withdrawing", async () => {
    seedResult();
    await create();
    await withdraw();
    const r = await create();
    expect(r.status).toBe("PENDING");
    expect(store("examAppeal")).toHaveLength(2);
  });
});

// ─── Concurrency across commands ───────────────────────────────────────────────

describe("appeal concurrency", () => {
  it("70. double approve of the same appeal (2nd → APPEAL_NOT_UNDER_REVIEW)", async () => {
    seedResult();
    await seedUnderReview();
    await approve();
    await expect(approve()).rejects.toThrowError(
      /APPEAL_NOT_UNDER_REVIEW|APPEAL_CONCURRENTLY_CHANGED/
    );
  });

  it("71. double review of the same appeal (2nd → APPEAL_NOT_PENDING)", async () => {
    seedResult();
    await create();
    await review();
    await expect(review()).rejects.toThrowError(/APPEAL_NOT_PENDING/);
  });

  it("72. approve then reject the same appeal (reject → APPEAL_NOT_UNDER_REVIEW)", async () => {
    seedResult();
    await seedUnderReview();
    await approve();
    await expect(reject()).rejects.toThrowError(/APPEAL_NOT_UNDER_REVIEW/);
  });
});

// ─── Official result resolver ──────────────────────────────────────────────────

describe("resolveOfficialExamResult (pure)", () => {
  const baseResult = (): ExamResultRecord => ({
    id: "res-1", organizationId: ORG, examCandidateId: "cand-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1",
    score: 45, maxScore: 60, normalizedScore: 75, status: "PUBLISHED", resultCode: "SCORED",
    markerId: "m", reviewedById: "r", approvedById: "a", submittedAt: T, reviewedAt: T,
    approvedAt: T, publishedAt: T, invalidatedAt: null, invalidationReason: null, remarks: null,
    resultChecksum: null, currentRevisionId: null, createdAt: T, updatedAt: T,
  });

  const rev = (over: Partial<ExamResultRevisionRecord> = {}): ExamResultRevisionRecord => ({
    id: "rev-1", organizationId: ORG, examResultId: "res-1", revisionNumber: 1,
    previousScore: 45, revisedScore: 50, previousStatus: "PUBLISHED", revisedStatus: "PUBLISHED",
    reason: "erro", sourceType: "APPEAL", status: "CURRENT", isCurrent: true, createdById: "u-1",
    approvedById: null, approvedAt: null, createdAt: T, updatedAt: T, ...over,
  });

  it("73. base result when there is no revision (score/normalized unchanged)", () => {
    const v = resolveOfficialExamResult({ result: baseResult(), currentRevision: null });
    expect(v.score).toBe(45);
    expect(v.normalizedScore).toBe(75);
    expect(v.hasRevision).toBe(false);
    expect(v.revisionId).toBeNull();
  });

  it("74. revised score + recomputed normalized when a revision exists", () => {
    const v = resolveOfficialExamResult({ result: baseResult(), currentRevision: rev({ revisedScore: 50 }) });
    expect(v.score).toBe(50);
    expect(v.normalizedScore).toBe(83.33); // round(50/60*100, 2)
    expect(v.hasRevision).toBe(true);
    expect(v.revisionId).toBe("rev-1");
    expect(v.revisionNumber).toBe(1);
  });

  it("75. resultCode / status always come from the base result", () => {
    const v = resolveOfficialExamResult({ result: baseResult(), currentRevision: rev() });
    expect(v.resultCode).toBe("SCORED");
    expect(v.status).toBe("PUBLISHED");
  });

  it("76. a non-SCORED result keeps its stored normalized (no recompute)", () => {
    const r = { ...baseResult(), resultCode: "ABSENT", score: null, normalizedScore: null };
    const v = resolveOfficialExamResult({ result: r, currentRevision: null });
    expect(v.score).toBeNull();
    expect(v.normalizedScore).toBeNull();
  });
});

// ─── Official result service (integration over the fake db) ────────────────────

describe("getOfficialExamResult (read service)", () => {
  it("77. returns the revised score after an approval", async () => {
    seedResult();
    await seedUnderReview();
    await approve({ revisedScore: 50 });
    const v = await getOfficialExamResult({ organizationId: ORG, examResultId: "res-1" }, h.db as never);
    expect(v).toBeTruthy();
    expect(v!.score).toBe(50);
    expect(v!.normalizedScore).toBe(83.33);
    expect(v!.hasRevision).toBe(true);
  });

  it("78. returns the base result when no revision exists", async () => {
    seedResult();
    const v = await getOfficialExamResult({ organizationId: ORG, examResultId: "res-1" }, h.db as never);
    expect(v!.score).toBe(45);
    expect(v!.hasRevision).toBe(false);
  });

  it("79. returns null when no result matches for the org", async () => {
    const v = await getOfficialExamResult({ organizationId: ORG, examResultId: "nope" }, h.db as never);
    expect(v).toBeNull();
  });
});
