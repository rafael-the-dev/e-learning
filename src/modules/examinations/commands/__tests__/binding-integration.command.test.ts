import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, asClient, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// PHASE 11B — LIVE EXAM→GRADE INTEGRATION VIA THE PRODUCTION RESOLVER (ADR-014)
// -----------------------------------------------------------------------------
// Exercises `IntegratePublishedExamResultCommand` with the REAL production
// component resolver (`productionComponentResolver`) driving a seeded
// `ExamGradeComponentBinding`, and a FAKE grade / progression port (so the exam
// unit tests never touch the real Grade cascade). Proves the resolver→binding→
// component→port path end-to-end: a bound SCORED result integrates with the bound
// `assessmentComponentId`; an UNBOUND / incompatible / cross-tenant session is
// UNSUPPORTED (no heuristic rescue); repeat is UNCHANGED; a revision updates; a
// concurrent version aborts; a grade failure skips progression; and both a rebind
// and a retraction are blocked once the session was consumed. Two focused tests
// exercise the PRODUCTION grade port's maxScore/maxGrade reconciliation directly.
// =============================================================================

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }));
const authState = vi.hoisted(() => ({ allow: true }));

vi.mock("@/server/db", () => ({ getDb: vi.fn(async () => h.db) }));
vi.mock("@/server/auth/rbac", () => ({
  getUserPermissions: vi.fn(async () => new Set<string>()),
  createAbility: () => ({ can: () => authState.allow }),
}));

import { BusinessRuleError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import {
  productionComponentResolver,
  productionGradeWritePort,
} from "../../integrations/production-ports";
import type {
  ExamGradeWritePort,
  ExamProgressionConfirmPort,
} from "../integration-shared";
import { IntegratePublishedExamResultCommand } from "../integration.commands";
import { BindExamSessionToGradeComponentCommand } from "../binding.commands";
import { RetractExamSessionPublicationCommand } from "../publication.commands";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
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
function seedCandidate(over: Record<string, unknown> = {}): void {
  seed(h.db, "examCandidate", {
    id: "cand-1", organizationId: ORG, examSessionId: "sess-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", eligibilityStatus: "ELIGIBLE", status: "REGISTERED",
    assignedSeat: null, registeredAt: NOW, registeredById: "u-0", withdrawnAt: null,
    withdrawnById: null, disqualifiedAt: null, disqualifiedById: null, disqualificationReason: null,
    overriddenById: null, overrideReason: null, eligibilitySnapshot: null, deletedAt: null, ...over,
  });
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
function seedRevision(over: Record<string, unknown> = {}): void {
  seed(h.db, "examResultRevision", {
    id: "rev-1", organizationId: ORG, examResultId: "res-1", revisionNumber: 1,
    previousScore: 45, revisedScore: 54, previousStatus: null, revisedStatus: null,
    reason: "recurso deferido", sourceType: "APPEAL", status: "CURRENT", isCurrent: true,
    createdById: "u-0", approvedById: "u-0", approvedAt: NOW, ...over,
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
function seedBinding(over: Record<string, unknown> = {}): void {
  seed(h.db, "examGradeComponentBinding", {
    id: "bind-1", organizationId: ORG, examSessionId: "sess-1", assessmentComponentId: "comp-1",
    createdById: "u-1", deletedAt: null, createdAt: NOW, updatedAt: NOW, ...over,
  });
}
function seedPublication(over: Record<string, unknown> = {}): void {
  seed(h.db, "examPublication", {
    id: "pub-1", organizationId: ORG, examSessionId: "sess-1", status: "PUBLISHED",
    publishedAt: NOW, publishedById: "u-0", retractedAt: null, retractedById: null, reason: null,
    ...over,
  });
}

/** The whole compatible, bound, integratable graph. */
function seedBoundIntegratable(): void {
  seedSession();
  seedCandidate();
  seedResult();
  seedComponent();
  seedPolicy();
  seedLevelSubject();
  seedBinding();
}

// ─── Fake grade / progression ports (production RESOLVER, fake writes) ──────────

const callOrder: string[] = [];
function makeFakeGradePort(action: "CREATED" | "UPDATED" | "UNCHANGED" = "CREATED", throwErr?: Error) {
  const calls: Array<Record<string, unknown>> = [];
  const port: ExamGradeWritePort = {
    async apply(input) {
      calls.push(input as unknown as Record<string, unknown>);
      callOrder.push("grade");
      if (throwErr) throw throwErr;
      return { gradeRecordId: "grade-1", action, progressionStatus: null };
    },
  };
  return { port, calls };
}
function makeFakeProgression(status: string | null = "IN_PROGRESS", throwErr?: Error) {
  const calls: Array<Record<string, unknown>> = [];
  const port: ExamProgressionConfirmPort = {
    async confirm(input) {
      calls.push(input as unknown as Record<string, unknown>);
      callOrder.push("progression");
      if (throwErr) throw throwErr;
      return { recalculated: true, status };
    },
  };
  return { port, calls };
}

/** Ports with the REAL resolver + fake grade/progression. */
function prodResolverPorts(over: { gradePort?: ExamGradeWritePort; progressionPort?: ExamProgressionConfirmPort } = {}) {
  return {
    resolver: productionComponentResolver,
    gradePort: over.gradePort ?? makeFakeGradePort().port,
    progressionPort: over.progressionPort ?? makeFakeProgression().port,
  };
}

const integrate = (ports = prodResolverPorts(), input: Record<string, unknown> = {}) =>
  new IntegratePublishedExamResultCommand({ examResultId: "res-1", ...input }, ctx, ports).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  callOrder.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Resolver-driven integration (end-to-end path) ─────────────────────────────

describe("IntegratePublishedExamResultCommand — production resolver + seeded binding", () => {
  it("1. resolves the bound component and calls the grade port with it (comp-1 / subj-1)", async () => {
    seedBoundIntegratable();
    const grade = makeFakeGradePort();
    const r = await integrate(prodResolverPorts({ gradePort: grade.port }));
    expect(grade.calls).toHaveLength(1);
    expect(grade.calls[0]).toMatchObject({
      assessmentComponentId: "comp-1", subjectId: "subj-1",
      enrollmentId: "enr-1", levelSubjectId: "ls-1", studentId: "stu-1",
      grade: 45, maxGrade: 60, normalizedGrade: 75, actorId: "u-1",
    });
    expect(r.gradeAction).toBe("CREATED");
  });

  it("2. progression is confirmed AFTER the grade write (resolve → grade → progression)", async () => {
    seedBoundIntegratable();
    await integrate();
    expect(callOrder).toEqual(["grade", "progression"]);
  });

  it("3. a SCORED write records an exam_result.integrated event", async () => {
    seedBoundIntegratable();
    await integrate();
    expect(eventsOf("exam_result.integrated")).toHaveLength(1);
  });

  it("4. an UNBOUND session → EXAM_RESULT_INTEGRATION_UNSUPPORTED; grade port not called", async () => {
    seedSession();
    seedCandidate();
    seedResult();
    seedComponent();
    seedPolicy();
    seedLevelSubject();
    // No binding seeded.
    const grade = makeFakeGradePort();
    await expect(integrate(prodResolverPorts({ gradePort: grade.port }))).rejects.toThrowError(
      /EXAM_RESULT_INTEGRATION_UNSUPPORTED/
    );
    expect(grade.calls).toHaveLength(0);
    expect(eventsOf("exam_result.integrated")).toHaveLength(0);
  });

  it("5. a repeat at the same version is UNCHANGED (no second event)", async () => {
    seedBoundIntegratable();
    await integrate();
    const r2 = await integrate();
    expect(r2.gradeAction).toBe("UNCHANGED");
    expect(eventsOf("exam_result.integrated")).toHaveLength(1);
  });

  it("6. a revised official version integrates the revised score + revision version", async () => {
    seedSession();
    seedCandidate();
    seedResult({ currentRevisionId: "rev-1" });
    seedRevision();
    seedComponent();
    seedPolicy();
    seedLevelSubject();
    seedBinding();
    const grade = makeFakeGradePort("UPDATED");
    const r = await integrate(prodResolverPorts({ gradePort: grade.port }));
    expect(r.officialVersion).toBe("result:res-1:revision:rev-1");
    expect(grade.calls[0]).toMatchObject({ grade: 54, assessmentComponentId: "comp-1" });
  });

  it("7. a concurrent official-version change aborts → OFFICIAL_RESULT_CHANGED", async () => {
    seedBoundIntegratable();
    seedRevision();
    let call = 0;
    const real = h.db.examResult.findFirst.bind(h.db.examResult);
    h.db.examResult.findFirst = async (args: { where?: Record<string, unknown> }) => {
      call += 1;
      const row = await real(args);
      if (row && call >= 2) return { ...row, currentRevisionId: "rev-1" };
      return row;
    };
    await expect(integrate()).rejects.toThrowError(/OFFICIAL_RESULT_CHANGED/);
  });

  it("8. a grade-port failure → EXAM_RESULT_INTEGRATION_FAILED; progression NOT called", async () => {
    seedBoundIntegratable();
    const grade = makeFakeGradePort("CREATED", new Error("db down"));
    const prog = makeFakeProgression();
    await expect(
      integrate(prodResolverPorts({ gradePort: grade.port, progressionPort: prog.port }))
    ).rejects.toThrowError(/EXAM_RESULT_INTEGRATION_FAILED/);
    expect(prog.calls).toHaveLength(0);
  });

  it("9. an incompatible binding (component policy levelSubject ≠ session) → UNSUPPORTED (no heuristic rescue)", async () => {
    seedSession();
    seedCandidate();
    seedResult();
    // 'Exame Final' / weight 100 would win any heuristic, but its policy is ls-OTHER.
    seedComponent();
    seedPolicy({ levelSubjectId: "ls-OTHER" });
    seedLevelSubject();
    seedBinding();
    await expect(integrate()).rejects.toThrowError(/EXAM_RESULT_INTEGRATION_UNSUPPORTED/);
  });

  it("10. a cross-tenant binding is invisible → UNSUPPORTED", async () => {
    seedSession();
    seedCandidate();
    seedResult();
    seedComponent();
    seedPolicy();
    seedLevelSubject();
    seedBinding({ organizationId: OTHER_ORG });
    await expect(integrate()).rejects.toThrowError(/EXAM_RESULT_INTEGRATION_UNSUPPORTED/);
  });

  it("11. once integrated, a rebind is blocked → EXAM_GRADE_BINDING_ALREADY_CONSUMED", async () => {
    seedBoundIntegratable();
    await integrate();
    await expect(
      new BindExamSessionToGradeComponentCommand(
        { examSessionId: "sess-1", assessmentComponentId: "comp-1" },
        ctx
      ).run()
    ).rejects.toThrowError(/EXAM_GRADE_BINDING_ALREADY_CONSUMED/);
  });

  it("12. once integrated, a retraction is blocked → PUBLICATION_ALREADY_CONSUMED", async () => {
    seedBoundIntegratable();
    seedPublication();
    await integrate();
    await expect(
      new RetractExamSessionPublicationCommand({ examSessionId: "sess-1", reason: "erro" }, ctx).run()
    ).rejects.toThrowError(/PUBLICATION_ALREADY_CONSUMED/);
    expect(store("examPublication")[0].status).toBe("PUBLISHED");
  });
});

// ─── Focused PRODUCTION grade-port reconciliation (direct, no cascade) ──────────

describe("productionGradeWritePort — maxScore/maxGrade reconciliation", () => {
  const applyInput = (over: Record<string, unknown> = {}) => ({
    organizationId: ORG, enrollmentId: "enr-1", studentId: "stu-1", levelSubjectId: "ls-1",
    subjectId: "subj-1", assessmentComponentId: "comp-1", grade: 45, maxGrade: 60,
    normalizedGrade: 75, actorId: "u-1", reason: "integração", officialVersion: "result:res-1",
    ...over,
  });

  it("13. throws UNSUPPORTED when the exam maxScore ≠ the bound component maxGrade", async () => {
    seedComponent({ maxGrade: 100 });
    await expect(
      productionGradeWritePort.apply(applyInput(), ctx, asClient(h.db))
    ).rejects.toThrowError(/EXAM_RESULT_INTEGRATION_UNSUPPORTED/);
    // No grade row written (the guard fires before the canonical write).
    expect(store("studentAssessmentResult")).toHaveLength(0);
  });

  it("14. throws UNSUPPORTED when the bound component no longer exists", async () => {
    await expect(
      productionGradeWritePort.apply(applyInput(), ctx, asClient(h.db))
    ).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store("studentAssessmentResult")).toHaveLength(0);
  });
});
