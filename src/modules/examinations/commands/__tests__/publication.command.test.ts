import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 9 EXAM RESULT PUBLICATION COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives publish / retract against the rollback-capable in-memory fake DB. These
// prove the Examination Engine PUBLISHES an entire session's official results AT
// ONCE (the visibility boundary): every active (REGISTERED) candidate must have an
// APPROVED, attendance-aligned result, then APPROVED → PUBLISHED for all results, the
// session moves COMPLETED → RESULTS_RECORDED → PUBLISHED, and a PUBLISHED
// ExamPublication is created — all in ONE tx that also writes ExamEvent + AuditLog.
// They also prove retraction is a reversible escape hatch (publication → RETRACTED,
// results → APPROVED, session → RESULTS_RECORDED, NO deletes), that post-publication
// CONTENT (score / resultCode / marker / reviewer / approver) is never mutated, and
// that conditional-write races abort cleanly. `@/server/db` (→ fake) and
// `@/server/auth/rbac` (allow/deny + recorded perms) are the only mocks.
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
  PublishExamSessionResultsCommand,
  RetractExamSessionPublicationCommand,
} from "../publication.commands";

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
    score: 45, maxScore: 60, normalizedScore: 75, status: "APPROVED", resultCode: "SCORED",
    markerId: "marker-1", reviewedById: "reviewer-1", approvedById: "approver-1", submittedAt: S_END,
    reviewedAt: S_END, approvedAt: S_END, publishedAt: null, invalidatedAt: null, invalidationReason: null,
    remarks: null, resultChecksum: null, currentRevisionId: null, ...over,
  });
}

function seedPublication(over: Record<string, unknown> = {}): void {
  seed(h.db, "examPublication", {
    id: "pub-1", organizationId: ORG, examSessionId: "sess-1", status: "PUBLISHED",
    publishedAt: S_END, publishedById: "u-0", retractedAt: null, retractedById: null, reason: null, ...over,
  });
}

/** COMPLETED session + one REGISTERED candidate + one APPROVED, PRESENT-aligned
 *  result — the canonical publishable fixture. */
function seedPublishable(sessionOver: Record<string, unknown> = {}, resultOver: Record<string, unknown> = {}): void {
  seedSession(sessionOver);
  seedCandidate();
  seedResult(resultOver);
  seedAttendance({ status: "PRESENT" });
}

/** A published session with a PUBLISHED publication + PUBLISHED result — retractable. */
function seedRetractable(): void {
  seedSession({ status: "PUBLISHED", publishedAt: S_END, publishedById: "u-0" });
  seedCandidate();
  seedResult({ status: "PUBLISHED", publishedAt: S_END });
  seedAttendance({ status: "PRESENT" });
  seedPublication();
}

const publish = (over: Record<string, unknown> = {}, context = ctx) =>
  new PublishExamSessionResultsCommand({ examSessionId: "sess-1", ...over }, context).run();

const retract = (over: Record<string, unknown> = {}, context = ctx) =>
  new RetractExamSessionPublicationCommand(
    { examSessionId: "sess-1", reason: "erro de publicação", ...over },
    context
  ).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Publish ─────────────────────────────────────────────────────────────────

describe("PublishExamSessionResultsCommand", () => {
  it("1. publishes a COMPLETED session (→ PUBLISHED)", async () => {
    seedPublishable();
    const r = await publish();
    expect(r.status).toBe("PUBLISHED");
    expect(store("examSession")[0].status).toBe("PUBLISHED");
  });

  it("2. COMPLETED → RESULTS_RECORDED → PUBLISHED atomically (both session events)", async () => {
    seedPublishable();
    await publish();
    expect(store("examSession")[0].status).toBe("PUBLISHED");
    expect(eventsOf("exam_session.results_recorded")).toHaveLength(1);
    expect(eventsOf("exam_session.published")).toHaveLength(1);
  });

  it("3. publishes an already-RESULTS_RECORDED session (no results_recorded event)", async () => {
    seedPublishable({ status: "RESULTS_RECORDED" });
    const r = await publish();
    expect(r.status).toBe("PUBLISHED");
    expect(eventsOf("exam_session.results_recorded")).toHaveLength(0);
    expect(eventsOf("exam_session.published")).toHaveLength(1);
  });

  it("4. flips APPROVED results → PUBLISHED (stores rows)", async () => {
    seedPublishable();
    await publish();
    expect(store("examResult")[0].status).toBe("PUBLISHED");
    expect(store("examResult")[0].publishedAt).toBeInstanceOf(Date);
  });

  it("5. creates an ExamPublication PUBLISHED", async () => {
    seedPublishable();
    const r = await publish();
    const pub = store("examPublication").find((p) => p.id === r.publicationId);
    expect(pub).toBeTruthy();
    expect(pub!.status).toBe("PUBLISHED");
  });

  it("6. sets publishedAt / publishedById on the publication", async () => {
    seedPublishable();
    const r = await publish();
    expect(r.publishedById).toBe("u-1");
    expect(r.publishedAt).toBeInstanceOf(Date);
    const pub = store("examPublication").find((p) => p.id === r.publicationId)!;
    expect(pub.publishedById).toBe("u-1");
    expect(pub.publishedAt).toBeInstanceOf(Date);
  });

  it("7. emits exam_publication.published event with resultCount / publishedResultIds", async () => {
    seedPublishable();
    await publish();
    const evt = eventsOf("exam_publication.published");
    expect(evt).toHaveLength(1);
    expect((evt[0] as { aggregateType: string }).aggregateType).toBe("EXAM_PUBLICATION");
    const nv = parseNew("exam_publication.published");
    expect(nv.resultCount).toBe(1);
    expect(nv.publishedResultIds).toEqual(["res-1"]);
    expect(nv.newSessionStatus).toBe("PUBLISHED");
    expect(nv.publishedById).toBe("u-1");
  });

  it("8. writes an audit log for the publication", async () => {
    seedPublishable();
    await publish();
    expect(auditFor("exam_publication.published")).toBeTruthy();
  });

  it("9. rejects an empty session → SESSION_NOT_READY_FOR_PUBLICATION", async () => {
    seedSession();
    await expect(publish()).rejects.toThrowError(/SESSION_NOT_READY_FOR_PUBLICATION/);
  });

  it("10. a required candidate with no result → RESULTS_MISSING", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seedResult({ id: "res-1", examCandidateId: "cand-1" });
    seedAttendance({ id: "a1", examCandidateId: "cand-1", status: "PRESENT" });
    await expect(publish()).rejects.toThrowError(/RESULTS_MISSING/);
  });

  it("11. a DRAFT result → RESULTS_NOT_APPROVED", async () => {
    seedPublishable({}, { status: "DRAFT" });
    await expect(publish()).rejects.toThrowError(/RESULTS_NOT_APPROVED/);
  });

  it("12. a SUBMITTED result → RESULTS_NOT_APPROVED", async () => {
    seedPublishable({}, { status: "SUBMITTED" });
    await expect(publish()).rejects.toThrowError(/RESULTS_NOT_APPROVED/);
  });

  it("13. a REVIEWED result → RESULTS_NOT_APPROVED", async () => {
    seedPublishable({}, { status: "REVIEWED" });
    await expect(publish()).rejects.toThrowError(/RESULTS_NOT_APPROVED/);
  });

  it("14. an INVALIDATED result → RESULTS_NOT_APPROVED", async () => {
    seedPublishable({}, { status: "INVALIDATED" });
    await expect(publish()).rejects.toThrowError(/RESULTS_NOT_APPROVED/);
  });

  it("15. attendance / result mismatch → RESULT_STALE", async () => {
    seedPublishable();
    // Correct attendance to ABSENT after the result was recorded as SCORED.
    store("examAttendance")[0].status = "ABSENT";
    await expect(publish()).rejects.toThrowError(/RESULT_STALE/);
  });

  it("16. invalid session state (IN_PROGRESS) → SESSION_NOT_READY_FOR_PUBLICATION", async () => {
    seedPublishable({ status: "IN_PROGRESS" });
    await expect(publish()).rejects.toThrowError(/SESSION_NOT_READY_FOR_PUBLICATION/);
  });

  it("17. an existing active publication → PUBLICATION_ALREADY_EXISTS", async () => {
    seedPublishable();
    seedPublication({ id: "pub-existing" });
    await expect(publish()).rejects.toThrowError(/PUBLICATION_ALREADY_EXISTS/);
  });

  it("18. cross-tenant session is hidden → NotFound", async () => {
    seedPublishable();
    await expect(publish({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("19. result-count mismatch aborts → RESULT_CONCURRENTLY_CHANGED + rollback", async () => {
    seedPublishable({ status: "RESULTS_RECORDED" });
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(publish()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
    expect(store("examResult")[0].status).toBe("APPROVED");
    expect(store("examPublication")).toHaveLength(0);
  });

  it("20. session publish conditional count 0 aborts", async () => {
    seedPublishable({ status: "RESULTS_RECORDED" });
    h.db.examSession.updateMany = async () => ({ count: 0 });
    await expect(publish()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
  });

  it("21. rollback on a failed event write leaves everything unchanged", async () => {
    seedPublishable();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(publish()).rejects.toThrow(/boom/);
    expect(store("examSession")[0].status).toBe("COMPLETED");
    expect(store("examResult")[0].status).toBe("APPROVED");
    expect(store("examResult")[0].publishedAt).toBeNull();
    expect(audits()).toHaveLength(0);
  });

  it("22. publication is not created on rollback", async () => {
    seedPublishable();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(publish()).rejects.toThrow(/boom/);
    expect(store("examPublication")).toHaveLength(0);
  });

  it("23. result content fields are unchanged (score / resultCode / marker / reviewer / approver)", async () => {
    seedPublishable();
    await publish();
    const row = store("examResult")[0];
    expect(row.score).toBe(45);
    expect(row.normalizedScore).toBe(75);
    expect(row.resultCode).toBe("SCORED");
    expect(row.markerId).toBe("marker-1");
    expect(row.reviewedById).toBe("reviewer-1");
    expect(row.approvedById).toBe("approver-1");
  });

  it("24. candidate / attendance are unchanged", async () => {
    seedPublishable();
    await publish();
    expect(store("examCandidate")[0].status).toBe("REGISTERED");
    expect(store("examAttendance")[0].status).toBe("PRESENT");
  });

  it("24b. WITHDRAWN / DISQUALIFIED candidates are not required (publishes without their result)", async () => {
    seedSession();
    seedCandidate({ id: "cand-1", status: "REGISTERED" });
    seedCandidate({ id: "cand-2", status: "WITHDRAWN", studentId: "stu-2" });
    seedResult({ id: "res-1", examCandidateId: "cand-1" });
    seedAttendance({ id: "a1", examCandidateId: "cand-1", status: "PRESENT" });
    const r = await publish();
    expect(r.status).toBe("PUBLISHED");
    expect(r.resultCount).toBe(1);
  });

  it("24c. persists the publish reason on the publication", async () => {
    seedPublishable();
    const r = await publish({ reason: "resultados finais" });
    const pub = store("examPublication").find((p) => p.id === r.publicationId)!;
    expect(pub.reason).toBe("resultados finais");
  });

  it("24d. RESULTS_MISSING lists the exact missing candidate id in details", async () => {
    seedSession();
    seedCandidate({ id: "cand-1" });
    seedCandidate({ id: "cand-2", studentId: "stu-2" });
    seedResult({ id: "res-1", examCandidateId: "cand-1" });
    seedAttendance({ id: "a1", examCandidateId: "cand-1", status: "PRESENT" });
    await publish().then(
      () => expect.fail("should have rejected"),
      (err: unknown) => {
        expect((err as Error).message).toBe("RESULTS_MISSING");
        expect((err as { details?: { missingCandidateIds?: string[] } }).details?.missingCandidateIds).toEqual([
          "cand-2",
        ]);
      }
    );
  });

  it("24e. requires exams.publishResults", async () => {
    seedPublishable();
    authState.allow = false;
    await expect(publish()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.publishResults");
  });

  it("24f. missing session is NotFound", async () => {
    await expect(publish()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("24g. actor ids are never taken from input (publishedById key rejected)", async () => {
    seedPublishable();
    await expect(
      new PublishExamSessionResultsCommand(
        { examSessionId: "sess-1", publishedById: "hacker" } as never,
        ctx
      ).run()
    ).rejects.toThrowError(/inválidos/i);
  });
});

// ─── Retract ─────────────────────────────────────────────────────────────────

describe("RetractExamSessionPublicationCommand", () => {
  it("25. retracts a PUBLISHED publication (→ RETRACTED)", async () => {
    seedRetractable();
    const r = await retract();
    expect(r.publicationStatus).toBe("RETRACTED");
    expect(store("examPublication")[0].status).toBe("RETRACTED");
  });

  it("26. session PUBLISHED → RESULTS_RECORDED", async () => {
    seedRetractable();
    const r = await retract();
    expect(r.sessionStatus).toBe("RESULTS_RECORDED");
    expect(store("examSession")[0].status).toBe("RESULTS_RECORDED");
  });

  it("27. results PUBLISHED → APPROVED", async () => {
    seedRetractable();
    await retract();
    expect(store("examResult")[0].status).toBe("APPROVED");
    expect(store("examResult")[0].publishedAt).toBeNull();
  });

  it("28. reason is required (omitting reason → ValidationError)", async () => {
    seedRetractable();
    await expect(
      new RetractExamSessionPublicationCommand({ examSessionId: "sess-1" } as never, ctx).run()
    ).rejects.toThrowError(/inválidos/i);
    expect(store("examPublication")[0].status).toBe("PUBLISHED");
  });

  it("29. a non-PUBLISHED publication → PUBLICATION_NOT_PUBLISHED", async () => {
    seedSession({ status: "PUBLISHED" });
    seedPublication({ status: "RETRACTED" });
    await expect(retract({ publicationId: "pub-1" })).rejects.toThrowError(
      /PUBLICATION_NOT_PUBLISHED/
    );
  });

  it("30. a non-PUBLISHED session → SESSION_NOT_PUBLISHED", async () => {
    seedSession({ status: "RESULTS_RECORDED" });
    seedPublication();
    await expect(retract()).rejects.toThrowError(/SESSION_NOT_PUBLISHED/);
  });

  it("31. result count mismatch aborts → RESULT_CONCURRENTLY_CHANGED", async () => {
    seedRetractable();
    h.db.examResult.updateMany = async () => ({ count: 0 });
    await expect(retract()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
    expect(store("examPublication")[0].status).toBe("PUBLISHED");
  });

  it("32. session conditional count 0 aborts", async () => {
    seedRetractable();
    h.db.examSession.updateMany = async () => ({ count: 0 });
    await expect(retract()).rejects.toThrowError(/RESULT_CONCURRENTLY_CHANGED/);
  });

  it("33. rollback on a failed event write leaves everything unchanged", async () => {
    seedRetractable();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(retract()).rejects.toThrow(/boom/);
    expect(store("examPublication")[0].status).toBe("PUBLISHED");
    expect(store("examSession")[0].status).toBe("PUBLISHED");
    expect(store("examResult")[0].status).toBe("PUBLISHED");
    expect(audits()).toHaveLength(0);
  });

  it("34. never deletes (publication row present as RETRACTED, result rows present)", async () => {
    seedRetractable();
    await retract();
    expect(store("examPublication")).toHaveLength(1);
    expect(store("examPublication")[0].status).toBe("RETRACTED");
    expect(store("examResult")).toHaveLength(1);
  });

  it("35. result content fields are unchanged after retract", async () => {
    seedRetractable();
    await retract();
    const row = store("examResult")[0];
    expect(row.score).toBe(45);
    expect(row.normalizedScore).toBe(75);
    expect(row.resultCode).toBe("SCORED");
    expect(row.markerId).toBe("marker-1");
    expect(row.reviewedById).toBe("reviewer-1");
    expect(row.approvedById).toBe("approver-1");
  });

  it("35b. emits exam_publication.retracted + exam_session.results_recorded events", async () => {
    seedRetractable();
    await retract();
    expect(eventsOf("exam_publication.retracted")).toHaveLength(1);
    expect(eventsOf("exam_session.results_recorded")).toHaveLength(1);
    const nv = parseNew("exam_publication.retracted");
    expect(nv.reason).toBe("erro de publicação");
    expect(nv.status).toBe("RETRACTED");
  });

  it("35c. requires exams.retractPublication", async () => {
    seedRetractable();
    authState.allow = false;
    await expect(retract()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.retractPublication");
  });

  it("35d. resolves by publicationId belonging to another session → NotFound", async () => {
    seedRetractable();
    seedPublication({ id: "pub-other", examSessionId: "sess-OTHER" });
    await expect(retract({ publicationId: "pub-other" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("35e. missing session is NotFound", async () => {
    await expect(retract()).rejects.toBeInstanceOf(NotFoundError);
  });

  it("35f. missing publication (no active) is NotFound", async () => {
    seedSession({ status: "PUBLISHED" });
    await expect(retract()).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Concurrency ───────────────────────────────────────────────────────────────

describe("publication concurrency", () => {
  it("36. double publish (2nd → PUBLICATION_ALREADY_EXISTS or session-not-ready)", async () => {
    seedPublishable();
    await publish();
    await expect(publish()).rejects.toThrowError(
      /PUBLICATION_ALREADY_EXISTS|SESSION_NOT_READY_FOR_PUBLICATION/
    );
  });

  it("37. double retract (2nd → PUBLICATION_NOT_PUBLISHED)", async () => {
    seedPublishable();
    const p = await publish();
    await retract({ publicationId: p.publicationId });
    await expect(retract({ publicationId: p.publicationId })).rejects.toThrowError(
      /PUBLICATION_NOT_PUBLISHED/
    );
  });

  it("38. publish works again after a retract", async () => {
    seedPublishable();
    const p1 = await publish();
    await retract({ publicationId: p1.publicationId });
    const p2 = await publish();
    expect(p2.status).toBe("PUBLISHED");
    expect(p2.publicationId).not.toBe(p1.publicationId);
    expect(store("examSession")[0].status).toBe("PUBLISHED");
    expect(store("examResult")[0].status).toBe("PUBLISHED");
  });
});
