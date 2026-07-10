import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 5 CANDIDATE-REGISTRATION COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives register / override / withdraw / disqualify against the rollback-capable
// in-memory fake DB. The REAL eligibility source (Phase 3A) runs against the fake —
// so Academic Core rows (student / enrollment / levelSubject / subject) are seeded
// and varied to drive eligible vs blocked. The REAL pure engine (Phase 3B) decides;
// it is wrapped in a delegating spy so a single test can force `requiresApproval`
// (Phase 3A always reports it UNKNOWN, so it cannot be produced from real facts).
// `@/server/db` (→ fake) and `@/server/auth/rbac` (allow/deny + recorded perms) are
// the only other mocks. The durable trail asserted on is the append-only `examEvent`
// store + the `auditLog` store, both written INSIDE the command tx.
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
// Delegating spy: default = the REAL engine; a test may override once.
vi.mock("@/modules/examinations/services/examination-eligibility.engine", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/examinations/services/examination-eligibility.engine")
  >();
  return { evaluateExaminationEligibility: vi.fn(actual.evaluateExaminationEligibility) };
});

import { AuthorizationError, BusinessRuleError, NotFoundError, ValidationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import type {
  ExaminationEligibilityFacts,
  ExaminationEligibilityResult,
} from "@/modules/examinations/types/eligibility-source";
import { evaluateExaminationEligibility } from "@/modules/examinations/services/examination-eligibility.engine";
import {
  OverrideExamCandidateEligibilityCommand,
  RegisterExamCandidateCommand,
} from "../candidate-registration.commands";
import {
  DisqualifyExamCandidateCommand,
  WithdrawExamCandidateCommand,
} from "../candidate-status.commands";

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

const S_START = new Date("2026-06-10T09:00:00.000Z");
const S_END = new Date("2026-06-10T12:00:00.000Z");
const P_START = new Date("2026-06-01T00:00:00.000Z");
const P_END = new Date("2026-06-30T23:59:59.000Z");

function engineResult(over: Partial<ExaminationEligibilityResult>): ExaminationEligibilityResult {
  return {
    eligible: true,
    blockingReasons: [],
    warnings: [],
    requiresApproval: false,
    evaluatedAt: P_START,
    evaluatedFacts: {} as ExaminationEligibilityFacts,
    metadata: { engineVersion: "examination-eligibility-engine.v1" },
    ...over,
  };
}

function seedPeriod(over: Record<string, unknown> = {}): void {
  seed(h.db, "examPeriod", {
    id: "per-1", organizationId: ORG, branchId: null, name: "Finais", academicYear: "2026",
    term: null, status: "OPEN", startsAt: P_START, endsAt: P_END,
    lockedAt: null, completedAt: null, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, cancelledById: null, deletedAt: null, ...over,
  });
}

function seedSession(over: Record<string, unknown> = {}): void {
  seed(h.db, "examSession", {
    id: "sess-1", organizationId: ORG, periodId: "per-1", branchId: null, courseId: null,
    courseLevelId: null, levelSubjectId: "ls-1", roomId: null, title: "Exame",
    status: "SCHEDULED", startsAt: S_START, endsAt: S_END, capacity: 20, instructions: null,
    lockedAt: null, startedAt: null, completedAt: null, publishedAt: null, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, publishedById: null, cancelledById: null,
    deletedAt: null, ...over,
  });
}

/** Academic Core rows the eligibility SOURCE reads. Defaults produce an ELIGIBLE
 *  verdict (active student + enrollment, live level-subject, no attendance/prereq
 *  blocker). Override individual rows to drive a blocked verdict. */
function seedAcademicCore(over: {
  student?: Record<string, unknown>;
  enrollment?: Record<string, unknown>;
  levelSubject?: Record<string, unknown>;
} = {}): void {
  seed(h.db, "student", {
    id: "stu-1", organizationId: ORG, code: "S001", firstName: "Ana", lastName: "Silva",
    status: "ACTIVE", deletedAt: null, ...over.student,
  });
  seed(h.db, "enrollment", {
    id: "enr-1", organizationId: ORG, status: "ACTIVE", courseId: "crs-1", courseLevelId: null,
    currentLevelId: null, deletedAt: null, ...over.enrollment,
  });
  seed(h.db, "levelSubject", {
    id: "ls-1", organizationId: ORG, subjectId: "subj-1", minimumAttendancePercentage: null,
    minimumPassingGrade: null, isRequired: true, credits: null, workloadHours: null, deletedAt: null,
    ...over.levelSubject,
  });
  seed(h.db, "subject", { id: "subj-1", organizationId: ORG, name: "Matemática" });
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

const register = (over: Record<string, unknown> = {}, context = ctx) =>
  new RegisterExamCandidateCommand(
    { examSessionId: "sess-1", studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1", ...over },
    context
  ).run();

const override = (over: Record<string, unknown> = {}, context = ctx) =>
  new OverrideExamCandidateEligibilityCommand(
    { examSessionId: "sess-1", studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1", reason: "decisão do diretor", ...over },
    context
  ).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Register (normal) ─────────────────────────────────────────────────────────

describe("RegisterExamCandidateCommand", () => {
  it("1. happy path → REGISTERED candidate with the real ELIGIBLE verdict", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    const r = await register();
    expect(r.status).toBe("REGISTERED");
    expect(r.eligibilityStatus).toBe("ELIGIBLE");
    expect(r.overridden).toBe(false);
    expect(store("examCandidate")).toHaveLength(1);
    expect(store("examCandidate")[0].registeredById).toBe("u-1");
  });

  it("2. creates the ExamAttempt (status OPEN, attemptNumber 1)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    const r = await register();
    expect(r.attemptNumber).toBe(1);
    expect(store("examAttempt")).toHaveLength(1);
    expect(store("examAttempt")[0].status).toBe("OPEN");
    expect(r.examAttemptId).toBe(store("examAttempt")[0].id);
  });

  it("3. writes the eligibilitySnapshot (engine verdict verbatim, override null)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    await register();
    const snap = JSON.parse(store("examCandidate")[0].eligibilitySnapshot as string);
    expect(snap.evaluated.eligible).toBe(true);
    expect(snap.evaluated.engineVersion).toBe("examination-eligibility-engine.v1");
    expect(snap.override).toBeNull();
  });

  it("4. emits exam_candidate.registered event + audit (no override event)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    await register();
    expect(eventsOf("exam_candidate.registered")).toHaveLength(1);
    expect(eventsOf("exam_candidate.eligibility_overridden")).toHaveLength(0);
    expect(auditFor("exam_candidate.registered")).toBeDefined();
  });

  it("5. audit metadata carries candidate / session / attempt / academic ids", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    const r = await register();
    const nv = parseNew("exam_candidate.registered");
    expect(nv.candidateId).toBe(r.examCandidateId);
    expect(nv.sessionId).toBe("sess-1");
    expect(nv.attemptId).toBe(r.examAttemptId);
    expect(nv.attemptNumber).toBe(1);
    expect(nv.studentId).toBe("stu-1");
    expect(nv.enrollmentId).toBe("enr-1");
    expect(nv.levelSubjectId).toBe("ls-1");
    expect(nv.overridden).toBe(false);
  });

  it("6. result DTO surfaces requiresApproval + warnings (no raw facts)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    const r = await register();
    expect(r.requiresApproval).toBe(false);
    expect(Array.isArray(r.warnings)).toBe(true);
    expect(r.warnings).toContain("ATTENDANCE_UNKNOWN");
    expect(r).not.toHaveProperty("evaluatedFacts");
  });

  it("7. persists an assigned seat", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    await register({ assignedSeat: "A1" });
    expect(store("examCandidate")[0].assignedSeat).toBe("A1");
  });

  it("8. attemptNumber increments when a prior attempt exists", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    seed(h.db, "examAttempt", {
      id: "att-prev", organizationId: ORG, studentId: "stu-1", enrollmentId: "enr-1",
      levelSubjectId: "ls-1", attemptNumber: 1, status: "RESULTED", source: "REGISTRATION", deletedAt: null,
    });
    const r = await register();
    expect(r.attemptNumber).toBe(2);
  });

  it("9. rejects registration under a LOCKED session (normal path = SCHEDULED only)", async () => {
    seedPeriod();
    seedSession({ status: "LOCKED" });
    seedAcademicCore();
    await expect(register()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(store("examCandidate")).toHaveLength(0);
  });

  it("10. rejects registration under a DRAFT session (SESSION_NOT_OPEN)", async () => {
    seedPeriod();
    seedSession({ status: "DRAFT" });
    seedAcademicCore();
    await expect(register()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_REGISTRATION/);
    expect(store("examAttempt")).toHaveLength(0);
  });

  it("11. rejects registration under a terminal (COMPLETED) session", async () => {
    seedPeriod();
    seedSession({ status: "COMPLETED" });
    seedAcademicCore();
    await expect(register()).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it("12. engine-blocked (inactive enrollment) → ELIGIBILITY_BLOCKED, zero side effects", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore({ enrollment: { status: "SUSPENDED" } });
    await expect(register()).rejects.toThrowError(/ELIGIBILITY_BLOCKED/);
    expect(store("examCandidate")).toHaveLength(0);
    expect(store("examAttempt")).toHaveLength(0);
    expect(events()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("13. ELIGIBILITY_BLOCKED carries the engine blockingReasons in details", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore({ enrollment: { status: "SUSPENDED" } });
    try {
      await register();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessRuleError);
      const details = (err as BusinessRuleError).details as { blockingReasons: string[] };
      expect(details.blockingReasons).toContain("NO_ACTIVE_ENROLLMENT");
    }
  });

  it("14. engine-blocked (missing student) → ELIGIBILITY_BLOCKED", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore({ student: { deletedAt: new Date() } });
    await expect(register()).rejects.toThrowError(/ELIGIBILITY_BLOCKED/);
  });

  it("15. engine-blocked (period not OPEN → EXAM_PERIOD_CLOSED)", async () => {
    seedPeriod({ status: "LOCKED" });
    seedSession();
    seedAcademicCore();
    try {
      await register();
      throw new Error("should have thrown");
    } catch (err) {
      const details = (err as BusinessRuleError).details as { blockingReasons: string[] };
      expect(details.blockingReasons).toContain("EXAM_PERIOD_CLOSED");
    }
  });

  it("16. requiresApproval → MANUAL_APPROVAL_REQUIRED, zero side effects", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    vi.mocked(evaluateExaminationEligibility).mockReturnValueOnce(
      engineResult({ eligible: true, requiresApproval: true })
    );
    await expect(register()).rejects.toThrowError(/MANUAL_APPROVAL_REQUIRED/);
    expect(store("examCandidate")).toHaveLength(0);
    expect(store("examAttempt")).toHaveLength(0);
  });

  it("17. duplicate active candidate → ALREADY_REGISTERED (no new attempt)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    seedCandidate({ status: "REGISTERED" });
    await expect(register()).rejects.toThrowError(/ALREADY_REGISTERED/);
    expect(store("examAttempt")).toHaveLength(0);
  });

  it("18. re-registration is allowed after a prior WITHDRAWN candidate", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    seedCandidate({ id: "cand-old", status: "WITHDRAWN" });
    const r = await register();
    expect(r.status).toBe("REGISTERED");
    expect(store("examCandidate")).toHaveLength(2);
  });

  it("19. capacity reached → SESSION_FULL", async () => {
    seedPeriod();
    seedSession({ capacity: 1 });
    seedAcademicCore();
    seedCandidate({ id: "cand-other", studentId: "stu-2", status: "REGISTERED" });
    await expect(register()).rejects.toThrowError(/SESSION_FULL/);
    expect(store("examAttempt")).toHaveLength(0);
  });

  it("20. taken seat → SEAT_UNAVAILABLE", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    seedCandidate({ id: "cand-seat", studentId: "stu-2", status: "REGISTERED", assignedSeat: "A1" });
    await expect(register({ assignedSeat: "A1" })).rejects.toThrowError(/SEAT_UNAVAILABLE/);
  });

  it("21. cross-tenant session is hidden → NotFound", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    await expect(register({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("22. rollback on a failed event write leaves zero side effects", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(register()).rejects.toThrow(/boom/);
    expect(store("examCandidate")).toHaveLength(0);
    expect(store("examAttempt")).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("23. requires exams.registerCandidates", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    authState.allow = false;
    await expect(register()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.registerCandidates");
  });

  it("24. a filtered-unique attempt collision maps to ATTEMPT_NUMBER_CONFLICT", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    h.db.examAttempt.create = async () => {
      throw { code: "P2002", message: "unique constraint" };
    };
    await expect(register()).rejects.toThrowError(/ATTEMPT_NUMBER_CONFLICT/);
  });

  it("25. a non-unique attempt error is rethrown as-is (not mapped)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    h.db.examAttempt.create = async () => {
      throw new Error("db offline");
    };
    await expect(register()).rejects.toThrow(/db offline/);
  });
});

// ─── Override (eligibility bypass) ───────────────────────────────────────────────

describe("OverrideExamCandidateEligibilityCommand", () => {
  it("26. requires exams.overrideEligibility", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    authState.allow = false;
    await expect(override()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.overrideEligibility");
  });

  it("27. requires a reason (ValidationError)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    await expect(override({ reason: "" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("28. bypasses an INELIGIBLE verdict and still registers", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore({ enrollment: { status: "SUSPENDED" } });
    const r = await override();
    expect(r.status).toBe("REGISTERED");
    expect(r.eligibilityStatus).toBe("INELIGIBLE");
    expect(r.overridden).toBe(true);
    expect(store("examCandidate")[0].overriddenById).toBe("u-1");
  });

  it("29. records override provenance in the snapshot", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore({ enrollment: { status: "SUSPENDED" } });
    await override({ reason: "autorizado" });
    const c = store("examCandidate")[0];
    expect(c.overrideReason).toBe("autorizado");
    const snap = JSON.parse(c.eligibilitySnapshot as string);
    expect(snap.override.overridden).toBe(true);
    expect(snap.override.overriddenBy).toBe("u-1");
    expect(snap.override.originalBlockingReasons).toContain("NO_ACTIVE_ENROLLMENT");
  });

  it("30. emits BOTH eligibility_overridden and registered events", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore({ enrollment: { status: "SUSPENDED" } });
    await override();
    expect(eventsOf("exam_candidate.eligibility_overridden")).toHaveLength(1);
    expect(eventsOf("exam_candidate.registered")).toHaveLength(1);
  });

  it("31. bypasses a requiresApproval gate", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    vi.mocked(evaluateExaminationEligibility).mockReturnValueOnce(
      engineResult({ eligible: true, requiresApproval: true })
    );
    const r = await override();
    expect(r.status).toBe("REGISTERED");
    expect(r.requiresApproval).toBe(true);
  });

  it("32. is allowed under a LOCKED session (late registration)", async () => {
    seedPeriod();
    seedSession({ status: "LOCKED" });
    seedAcademicCore();
    const r = await override();
    expect(r.status).toBe("REGISTERED");
  });

  it("33. is still rejected under a DRAFT session", async () => {
    seedPeriod();
    seedSession({ status: "DRAFT" });
    seedAcademicCore();
    await expect(override()).rejects.toThrowError(/SESSION_NOT_OPEN_FOR_REGISTRATION/);
  });

  it("34. CANNOT bypass a duplicate (ALREADY_REGISTERED)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    seedCandidate({ status: "REGISTERED" });
    await expect(override()).rejects.toThrowError(/ALREADY_REGISTERED/);
  });

  it("35. CANNOT bypass capacity (SESSION_FULL)", async () => {
    seedPeriod();
    seedSession({ capacity: 1 });
    seedAcademicCore();
    seedCandidate({ id: "cand-other", studentId: "stu-2", status: "REGISTERED" });
    await expect(override()).rejects.toThrowError(/SESSION_FULL/);
  });

  it("36. CANNOT bypass a taken seat (SEAT_UNAVAILABLE)", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    seedCandidate({ id: "cand-seat", studentId: "stu-2", status: "REGISTERED", assignedSeat: "A1" });
    await expect(override({ assignedSeat: "A1" })).rejects.toThrowError(/SEAT_UNAVAILABLE/);
  });

  it("37. cross-tenant session is hidden → NotFound", async () => {
    seedPeriod();
    seedSession();
    seedAcademicCore();
    await expect(override({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ─── Withdraw ────────────────────────────────────────────────────────────────

describe("WithdrawExamCandidateCommand", () => {
  const withdraw = (over: Record<string, unknown> = {}, context = ctx) =>
    new WithdrawExamCandidateCommand({ examCandidateId: "cand-1", ...over }, context).run();

  it("38. REGISTERED → WITHDRAWN (event + stamped actor)", async () => {
    seedCandidate({ status: "REGISTERED" });
    const r = await withdraw({ reason: "aluno desistiu" });
    expect(r.status).toBe("WITHDRAWN");
    expect(store("examCandidate")[0].status).toBe("WITHDRAWN");
    expect(store("examCandidate")[0].withdrawnById).toBe("u-1");
    const evt = eventsOf("exam_candidate.withdrawn")[0] as { previousStatus: string; newStatus: string };
    expect(evt.previousStatus).toBe("REGISTERED");
    expect(evt.newStatus).toBe("WITHDRAWN");
  });

  it("39. double-withdraw aborts (count 0) — no event", async () => {
    seedCandidate({ status: "WITHDRAWN" });
    await expect(withdraw()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(events()).toHaveLength(0);
  });

  it("40. a missing candidate is NotFound", async () => {
    await expect(withdraw({ examCandidateId: "nope" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("41. cross-tenant candidate is NotFound", async () => {
    seedCandidate({ status: "REGISTERED" });
    await expect(withdraw({}, otherCtx)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("42. requires exams.registerCandidates", async () => {
    seedCandidate({ status: "REGISTERED" });
    authState.allow = false;
    await expect(withdraw()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.registerCandidates");
  });
});

// ─── Disqualify ────────────────────────────────────────────────────────────────

describe("DisqualifyExamCandidateCommand", () => {
  const disqualify = (over: Record<string, unknown> = {}, context = ctx) =>
    new DisqualifyExamCandidateCommand({ examCandidateId: "cand-1", reason: "fraude", ...over }, context).run();

  it("43. REGISTERED → DISQUALIFIED (reason persisted + event)", async () => {
    seedCandidate({ status: "REGISTERED" });
    const r = await disqualify();
    expect(r.status).toBe("DISQUALIFIED");
    expect(store("examCandidate")[0].status).toBe("DISQUALIFIED");
    expect(store("examCandidate")[0].disqualifiedById).toBe("u-1");
    expect(store("examCandidate")[0].disqualificationReason).toBe("fraude");
    expect(eventsOf("exam_candidate.disqualified")).toHaveLength(1);
  });

  it("44. requires a reason (ValidationError)", async () => {
    seedCandidate({ status: "REGISTERED" });
    await expect(disqualify({ reason: "" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("45. double-disqualify aborts (count 0)", async () => {
    seedCandidate({ status: "DISQUALIFIED" });
    await expect(disqualify()).rejects.toBeInstanceOf(BusinessRuleError);
    expect(events()).toHaveLength(0);
  });

  it("46. a missing candidate is NotFound", async () => {
    await expect(disqualify({ examCandidateId: "nope" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("47. requires exams.registerCandidates", async () => {
    seedCandidate({ status: "REGISTERED" });
    authState.allow = false;
    await expect(disqualify()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.registerCandidates");
  });
});
