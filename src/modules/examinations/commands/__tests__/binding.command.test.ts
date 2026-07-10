import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, asClient, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 11B EXAM→GRADE-COMPONENT BINDING TESTS (ADR-014)
// -----------------------------------------------------------------------------
// Drives the explicit binding command + the canonical resolver against the
// rollback-capable in-memory fake DB. Proves: a valid binding is created (event +
// audit inside the tx); cross-tenant / missing session or component are hidden;
// an incompatible component (policy levelSubject ≠ session) is refused; the
// one-active invariant + consumed guard hold; the resolver reads the EXPLICIT
// binding only (never name / weight / order / componentType); and rollback leaves
// nothing. `@/server/db` (→ fake) and `@/server/auth/rbac` are mocked.
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

import { AuthorizationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  BindExamSessionToGradeComponentCommand,
  ArchiveExamSessionGradeComponentBindingCommand,
} from "../binding.commands";
import { resolveCanonicalAssessmentComponentForExamSession } from "../../services/exam-grade-component-resolver.service";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const otherCtx: ServiceContext = { userId: "u-x", organizationId: OTHER_ORG };

const NOW = new Date("2026-07-10T09:00:00.000Z");
const store = (name: string) => h.db[name].__store;
const eventsOf = (type: string) =>
  store("examEvent").filter((e) => (e as { eventType: string }).eventType === type);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function seedSession(over: Record<string, unknown> = {}): void {
  seed(h.db, "examSession", {
    id: "sess-1", organizationId: ORG, periodId: "per-1", branchId: null, courseId: null,
    courseLevelId: null, levelSubjectId: "ls-1", roomId: null, title: "Exame",
    status: "PUBLISHED", startsAt: NOW, endsAt: NOW, capacity: 20, instructions: null,
    lockedAt: null, startedAt: null, completedAt: null, publishedAt: NOW, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, publishedById: "u-0",
    cancelledById: null, deletedAt: null, ...over,
  });
}

function seedComponent(over: Record<string, unknown> = {}): void {
  seed(h.db, "assessmentComponent", {
    id: "comp-1", organizationId: ORG, assessmentPolicyId: "pol-1", name: "Exame Final",
    componentType: "FINAL_EXAM", weight: 100, maxGrade: 60, order: 1, isRequired: true,
    status: "ACTIVE", deletedAt: null, ...over,
  });
}

function seedPolicy(over: Record<string, unknown> = {}): void {
  seed(h.db, "assessmentPolicy", {
    id: "pol-1", organizationId: ORG, levelSubjectId: "ls-1", name: "Política",
    description: null, calculationMethod: "WEIGHTED_AVERAGE", roundingMethod: "NONE",
    minimumPassingGrade: 10, allowRetake: false, maxRetakes: 0, allowRecovery: false,
    status: "ACTIVE", deletedAt: null, ...over,
  });
}

function seedLevelSubject(over: Record<string, unknown> = {}): void {
  seed(h.db, "levelSubject", {
    id: "ls-1", organizationId: ORG, subjectId: "subj-1", minimumAttendancePercentage: null,
    minimumPassingGrade: 10, isRequired: true, credits: null, workloadHours: null,
    deletedAt: null, ...over,
  });
}

/** Full compatible fixture: session + component + policy + levelSubject (all org-A). */
function seedCompatible(): void {
  seedSession();
  seedComponent();
  seedPolicy();
  seedLevelSubject();
}

function seedResult(over: Record<string, unknown> = {}): void {
  seed(h.db, "examResult", {
    id: "res-1", organizationId: ORG, examCandidateId: "cand-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1", score: 45, maxScore: 60,
    normalizedScore: 75, status: "PUBLISHED", resultCode: "SCORED", markerId: null,
    reviewedById: null, approvedById: null, submittedAt: null, reviewedAt: null, approvedAt: null,
    publishedAt: NOW, invalidatedAt: null, invalidationReason: null, remarks: null,
    resultChecksum: null, currentRevisionId: null, ...over,
  });
}

function seedCandidate(over: Record<string, unknown> = {}): void {
  seed(h.db, "examCandidate", {
    id: "cand-1", organizationId: ORG, examSessionId: "sess-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", eligibilityStatus: "ELIGIBLE", status: "REGISTERED",
    assignedSeat: null, registeredAt: NOW, registeredById: "u-0", withdrawnAt: null,
    withdrawnById: null, disqualifiedAt: null, disqualifiedById: null, disqualificationReason: null,
    overriddenById: null, overrideReason: null, eligibilitySnapshot: null, deletedAt: null, ...over,
  });
}

function seedIntegratedEvent(eventType = "exam_result.integrated"): void {
  seed(h.db, "examEvent", {
    id: "e-int", organizationId: ORG, aggregateType: "EXAM_RESULT", aggregateId: "res-1",
    eventType, previousStatus: "", newStatus: "INTEGRATED", actorId: "u-1", reason: null,
    metadata: JSON.stringify({ officialVersion: "result:res-1" }), createdAt: NOW,
  });
}

const bind = (input: Record<string, unknown> = {}, context = ctx) =>
  new BindExamSessionToGradeComponentCommand(
    { examSessionId: "sess-1", assessmentComponentId: "comp-1", ...input },
    context
  ).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── BindExamSessionToGradeComponentCommand ────────────────────────────────────

describe("BindExamSessionToGradeComponentCommand", () => {
  it("1. creates a valid binding (row + returned ids)", async () => {
    seedCompatible();
    const r = await bind();
    expect(r.examSessionId).toBe("sess-1");
    expect(r.assessmentComponentId).toBe("comp-1");
    expect(r.bindingId).toBeTruthy();
    const rows = store("examGradeComponentBinding");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: ORG, examSessionId: "sess-1", assessmentComponentId: "comp-1",
      createdById: "u-1",
    });
  });

  it("2. writes a grade_component_bound event + audit inside the tx", async () => {
    seedCompatible();
    await bind({ reason: "mapeamento oficial" });
    const evts = eventsOf("exam_session.grade_component_bound");
    expect(evts).toHaveLength(1);
    expect((evts[0] as { aggregateType: string }).aggregateType).toBe("EXAM_SESSION");
    expect(
      store("auditLog").some((a) => (a as { action: string }).action === "exam_session.grade_component_bound")
    ).toBe(true);
  });

  it("3. event metadata carries the binding facts", async () => {
    seedCompatible();
    const r = await bind();
    const meta = JSON.parse(
      (eventsOf("exam_session.grade_component_bound")[0] as { metadata: string }).metadata
    );
    expect(meta).toMatchObject({
      bindingId: r.bindingId, examSessionId: "sess-1", assessmentComponentId: "comp-1",
      levelSubjectId: "ls-1",
    });
  });

  it("4. a missing session → EXAM_SESSION_NOT_FOUND", async () => {
    seedComponent();
    seedPolicy();
    seedLevelSubject();
    await expect(bind()).rejects.toThrowError(/EXAM_SESSION_NOT_FOUND/);
  });

  it("5. a cross-tenant session is hidden → EXAM_SESSION_NOT_FOUND", async () => {
    seedCompatible();
    seedComponent({ id: "comp-B", organizationId: OTHER_ORG, assessmentPolicyId: "pol-B" });
    seedPolicy({ id: "pol-B", organizationId: OTHER_ORG });
    await expect(
      new BindExamSessionToGradeComponentCommand(
        { examSessionId: "sess-1", assessmentComponentId: "comp-B" },
        otherCtx
      ).run()
    ).rejects.toThrowError(/EXAM_SESSION_NOT_FOUND/);
  });

  it("6. a missing component → ASSESSMENT_COMPONENT_NOT_FOUND", async () => {
    seedSession();
    seedPolicy();
    seedLevelSubject();
    await expect(bind()).rejects.toThrowError(/ASSESSMENT_COMPONENT_NOT_FOUND/);
  });

  it("7. a cross-tenant component is hidden → ASSESSMENT_COMPONENT_NOT_FOUND", async () => {
    seedSession();
    seedPolicy();
    seedLevelSubject();
    seedComponent({ organizationId: OTHER_ORG });
    await expect(bind()).rejects.toThrowError(/ASSESSMENT_COMPONENT_NOT_FOUND/);
  });

  it("8. an incompatible component (policy levelSubject ≠ session) → ASSESSMENT_COMPONENT_NOT_COMPATIBLE", async () => {
    seedSession();
    seedComponent();
    seedPolicy({ levelSubjectId: "ls-OTHER" });
    seedLevelSubject();
    await expect(bind()).rejects.toThrowError(/ASSESSMENT_COMPONENT_NOT_COMPATIBLE/);
  });

  it("9. a duplicate active binding → EXAM_GRADE_BINDING_ALREADY_EXISTS", async () => {
    seedCompatible();
    await bind();
    await expect(bind()).rejects.toThrowError(/EXAM_GRADE_BINDING_ALREADY_EXISTS/);
    expect(store("examGradeComponentBinding")).toHaveLength(1);
  });

  it("10. a consumed session (integrated event) → EXAM_GRADE_BINDING_ALREADY_CONSUMED", async () => {
    seedCompatible();
    seedCandidate();
    seedResult();
    seedIntegratedEvent("exam_result.integrated");
    await expect(bind()).rejects.toThrowError(/EXAM_GRADE_BINDING_ALREADY_CONSUMED/);
    expect(store("examGradeComponentBinding")).toHaveLength(0);
  });

  it("11. a consumed session (integration_reconciled event) → EXAM_GRADE_BINDING_ALREADY_CONSUMED", async () => {
    seedCompatible();
    seedCandidate();
    seedResult();
    seedIntegratedEvent("exam_result.integration_reconciled");
    await expect(bind()).rejects.toThrowError(/EXAM_GRADE_BINDING_ALREADY_CONSUMED/);
  });

  it("12. a non-integration event does NOT consume the session (binding still created)", async () => {
    seedCompatible();
    seedCandidate();
    seedResult();
    seed(h.db, "examEvent", {
      id: "e-pub", organizationId: ORG, aggregateType: "EXAM_RESULT", aggregateId: "res-1",
      eventType: "exam_result.published", previousStatus: "", newStatus: "PUBLISHED", actorId: "u-1",
      reason: null, metadata: null, createdAt: NOW,
    });
    const r = await bind();
    expect(r.bindingId).toBeTruthy();
  });

  it("13. requires exams.integrateResults", async () => {
    seedCompatible();
    authState.allow = false;
    await expect(bind()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.integrateResults");
  });

  it("14. actor ids are never taken from input (createdById rejected)", async () => {
    seedCompatible();
    await expect(
      new BindExamSessionToGradeComponentCommand(
        { examSessionId: "sess-1", assessmentComponentId: "comp-1", createdById: "hacker" } as never,
        ctx
      ).run()
    ).rejects.toThrowError(/inválidos/i);
  });

  it("15. rollback on a failed event write leaves NO binding / event / audit", async () => {
    seedCompatible();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(bind()).rejects.toThrow(/boom/);
    expect(store("examGradeComponentBinding")).toHaveLength(0);
    expect(store("examEvent")).toHaveLength(0);
    expect(store("auditLog")).toHaveLength(0);
  });
});

// ─── ArchiveExamSessionGradeComponentBindingCommand ────────────────────────────

const archive = (input: Record<string, unknown> = {}, context = ctx) =>
  new ArchiveExamSessionGradeComponentBindingCommand(
    { bindingId: "binding-x", reason: "correção", ...input },
    context
  ).run();

describe("ArchiveExamSessionGradeComponentBindingCommand", () => {
  it("16. archives an active binding (soft delete + event)", async () => {
    seedCompatible();
    const created = await bind();
    const r = await archive({ bindingId: created.bindingId });
    expect(r.archived).toBe(true);
    const row = store("examGradeComponentBinding")[0] as { deletedAt: Date | null };
    expect(row.deletedAt).not.toBeNull();
    expect(eventsOf("exam_session.grade_component_binding_archived")).toHaveLength(1);
  });

  it("17. a missing binding → EXAM_GRADE_BINDING_NOT_FOUND", async () => {
    await expect(archive()).rejects.toThrowError(/EXAM_GRADE_BINDING_NOT_FOUND/);
  });

  it("18. a cross-tenant binding is hidden → EXAM_GRADE_BINDING_NOT_FOUND", async () => {
    seedCompatible();
    const created = await bind();
    await expect(archive({ bindingId: created.bindingId }, otherCtx)).rejects.toThrowError(
      /EXAM_GRADE_BINDING_NOT_FOUND/
    );
  });

  it("19. an already-archived binding → EXAM_GRADE_BINDING_CONCURRENTLY_CHANGED", async () => {
    seedCompatible();
    const created = await bind();
    await archive({ bindingId: created.bindingId });
    await expect(archive({ bindingId: created.bindingId })).rejects.toThrowError(
      /EXAM_GRADE_BINDING_CONCURRENTLY_CHANGED/
    );
  });

  it("20. a consumed session cannot be archived → EXAM_GRADE_BINDING_ALREADY_CONSUMED", async () => {
    seedCompatible();
    const created = await bind();
    seedCandidate();
    seedResult();
    seedIntegratedEvent("exam_result.integrated");
    await expect(archive({ bindingId: created.bindingId })).rejects.toThrowError(
      /EXAM_GRADE_BINDING_ALREADY_CONSUMED/
    );
    const row = store("examGradeComponentBinding")[0] as { deletedAt: Date | null };
    expect(row.deletedAt ?? null).toBeNull();
  });

  it("21. requires exams.integrateResults", async () => {
    seedCompatible();
    const created = await bind();
    authState.allow = false;
    await expect(archive({ bindingId: created.bindingId })).rejects.toBeInstanceOf(AuthorizationError);
  });
});

// ─── resolveCanonicalAssessmentComponentForExamSession (the explicit resolver) ──

const resolve = (over: Record<string, unknown> = {}) =>
  resolveCanonicalAssessmentComponentForExamSession(
    { organizationId: ORG, examSessionId: "sess-1", levelSubjectId: "ls-1", ...over },
    asClient(h.db)
  );

describe("resolveCanonicalAssessmentComponentForExamSession", () => {
  it("22. resolves the explicit binding → component + subject + bindingId", async () => {
    seedCompatible();
    const created = await bind();
    const resolved = await resolve();
    expect(resolved).toEqual({
      assessmentComponentId: "comp-1", subjectId: "subj-1", bindingId: created.bindingId,
    });
  });

  it("23. no binding → null (UNSUPPORTED upstream)", async () => {
    seedCompatible();
    expect(await resolve()).toBeNull();
  });

  it("24. a wrong levelSubject (policy ≠ requested) → null (no rescue by name/weight)", async () => {
    seedCompatible();
    await bind();
    // The component 'Exame Final' with weight 100 would 'win' any heuristic, but its
    // policy levelSubject (ls-1) differs from the requested one → still null.
    expect(await resolve({ levelSubjectId: "ls-DIFFERENT" })).toBeNull();
  });

  it("25. a missing (archived) component → null", async () => {
    seedCompatible();
    await bind();
    h.db.assessmentComponent.__store[0].deletedAt = NOW;
    expect(await resolve()).toBeNull();
  });

  it("26. a missing levelSubject → null", async () => {
    seedSession();
    seedComponent();
    seedPolicy();
    await bind();
    expect(await resolve()).toBeNull();
  });

  it("27. a cross-tenant binding is invisible → null", async () => {
    seedCompatible();
    await bind();
    expect(
      await resolveCanonicalAssessmentComponentForExamSession(
        { organizationId: OTHER_ORG, examSessionId: "sess-1", levelSubjectId: "ls-1" },
        asClient(h.db)
      )
    ).toBeNull();
  });

  it("28. an archived binding is not resolved → null", async () => {
    seedCompatible();
    const created = await bind();
    await archive({ bindingId: created.bindingId });
    expect(await resolve()).toBeNull();
  });
});
