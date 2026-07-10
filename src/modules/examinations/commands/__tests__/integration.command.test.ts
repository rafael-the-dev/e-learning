import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeDb, seed, asClient, type FakeDb } from "../../repositories/__tests__/_fake-db";

// =============================================================================
// EXAMINATION ENGINE — PHASE 11 GRADE/PROGRESSION INTEGRATION COMMAND TESTS
// -----------------------------------------------------------------------------
// Drives the official published-result integration boundary against the rollback-
// capable in-memory fake DB, injecting FAKE ports so the full (production-gated)
// write path is exercised without touching the real Grade / Progression engines.
// They prove: only the current official PUBLISHED result integrates (base + revision
// overlay), a SCORED outcome maps 1:1 while ABSENT/EXCUSED/DISQUALIFIED is UNSUPPORTED
// (never a silent 0), the Grade port is the single writer called ONCE, progression is
// confirmed AFTER the grade, the ExamEvent metadata ledger makes a repeat UNCHANGED and
// a superseding revision STALE, reconciliation repairs staleness, retraction is rejected
// once consumed, and NO Grade / Transcript / Certificate table is ever written directly.
// `@/server/db` (→ fake) and `@/server/auth/rbac` (allow/deny + recorded perms) are mocks.
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
  loadOfficialResultForIntegration,
  type OfficialExamResultIntegrationDto,
} from "../../services/examination-grade-integration.source";
import {
  gradeStateFor,
  latestIntegratedVersion,
  mapExamOutcomeToGrade,
  type ExamGradeComponentResolverPort,
  type ExamGradeWritePort,
  type ExamProgressionConfirmPort,
} from "../integration-shared";
import {
  IntegratePublishedExamResultCommand,
  IntegrateExamSessionResultsCommand,
  ReconcileExamResultIntegrationCommand,
} from "../integration.commands";
import { RetractExamSessionPublicationCommand } from "../publication.commands";
import type { ExamEventRecord } from "../../types/repository";

const ORG = "org-A";
const OTHER_ORG = "org-B";
const ctx: ServiceContext = { userId: "u-1", organizationId: ORG };
const otherCtx: ServiceContext = { userId: "u-x", organizationId: OTHER_ORG };

const store = (name: string) => h.db[name].__store;
const events = () => store("examEvent");
const audits = () => store("auditLog");
const eventsOf = (type: string) =>
  events().filter((e) => (e as { eventType: string }).eventType === type);
const metaOf = (type: string) =>
  eventsOf(type).map((e) => JSON.parse((e as { metadata: string }).metadata) as Record<string, unknown>);

const NOW = new Date("2026-07-10T09:00:00.000Z");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function seedResult(over: Record<string, unknown> = {}): void {
  seed(h.db, "examResult", {
    id: "res-1", organizationId: ORG, examCandidateId: "cand-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", levelSubjectId: "ls-1",
    score: 45, maxScore: 60, normalizedScore: 75, status: "PUBLISHED", resultCode: "SCORED",
    markerId: "m-1", reviewedById: "rv-1", approvedById: "ap-1",
    submittedAt: null, reviewedAt: null, approvedAt: null, publishedAt: NOW, invalidatedAt: null,
    invalidationReason: null, remarks: null, resultChecksum: null, currentRevisionId: null, ...over,
  });
}

function seedCandidate(over: Record<string, unknown> = {}): void {
  seed(h.db, "examCandidate", {
    id: "cand-1", organizationId: ORG, examSessionId: "sess-1", examAttemptId: "att-1",
    studentId: "stu-1", enrollmentId: "enr-1", eligibilityStatus: "ELIGIBLE", status: "REGISTERED",
    assignedSeat: null, registeredAt: NOW, registeredById: "u-0", withdrawnAt: null, withdrawnById: null,
    disqualifiedAt: null, disqualifiedById: null, disqualificationReason: null, overriddenById: null,
    overrideReason: null, eligibilitySnapshot: null, deletedAt: null, ...over,
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

/** A published SCORED result + its candidate — the canonical integratable fixture. */
function seedIntegratable(resultOver: Record<string, unknown> = {}): void {
  seedResult(resultOver);
  seedCandidate();
}

// ─── Fake ports (record calls + global ordering) ──────────────────────────────

const callOrder: string[] = [];

function makeFakeResolver(
  result: { assessmentComponentId: string; subjectId: string } | null = {
    assessmentComponentId: "comp-1",
    subjectId: "subj-1",
  }
) {
  const calls: OfficialExamResultIntegrationDto[] = [];
  const port: ExamGradeComponentResolverPort = {
    async resolve(dto) {
      calls.push(dto);
      callOrder.push("resolve");
      return result;
    },
  };
  return { port, calls };
}

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

function fakePorts(over: {
  resolver?: ExamGradeComponentResolverPort;
  gradePort?: ExamGradeWritePort;
  progressionPort?: ExamProgressionConfirmPort;
} = {}) {
  return {
    resolver: over.resolver ?? makeFakeResolver().port,
    gradePort: over.gradePort ?? makeFakeGradePort().port,
    progressionPort: over.progressionPort ?? makeFakeProgression().port,
  };
}

const integrate = (input: Record<string, unknown> = {}, ports = fakePorts(), context = ctx) =>
  new IntegratePublishedExamResultCommand({ examResultId: "res-1", ...input }, context, ports).run();

beforeEach(() => {
  vi.clearAllMocks();
  h.db = makeFakeDb();
  authState.allow = true;
  authState.checked.length = 0;
  callOrder.length = 0;
});
afterEach(() => vi.restoreAllMocks());

// ─── Source (anti-corruption read) ────────────────────────────────────────────

describe("loadOfficialResultForIntegration (source)", () => {
  it("1. projects a base published result (no revision)", async () => {
    seedIntegratable();
    const dto = await loadOfficialResultForIntegration(
      { organizationId: ORG, examResultId: "res-1", sourceEvent: "PUBLICATION" },
      asClient(h.db)
    );
    expect(dto).toBeTruthy();
    expect(dto!.officialVersion).toBe("result:res-1");
    expect(dto!.resultCode).toBe("SCORED");
    expect(dto!.score).toBe(45);
    expect(dto!.maxScore).toBe(60);
    expect(dto!.examSessionId).toBe("sess-1");
    expect(dto!.currentRevisionId).toBeNull();
    expect(dto!.sourceEvent).toBe("PUBLICATION");
  });

  it("2. overlays the CURRENT revision (score + version + APPEAL_REVISION source)", async () => {
    seedIntegratable({ currentRevisionId: "rev-1" });
    seedRevision();
    const dto = await loadOfficialResultForIntegration(
      { organizationId: ORG, examResultId: "res-1", sourceEvent: "PUBLICATION" },
      asClient(h.db)
    );
    expect(dto!.officialVersion).toBe("result:res-1:revision:rev-1");
    expect(dto!.score).toBe(54);
    expect(dto!.normalizedScore).toBe(90);
    expect(dto!.sourceEvent).toBe("APPEAL_REVISION");
  });

  it("3. an unpublished result returns null", async () => {
    seedIntegratable({ status: "APPROVED" });
    const dto = await loadOfficialResultForIntegration(
      { organizationId: ORG, examResultId: "res-1", sourceEvent: "PUBLICATION" },
      asClient(h.db)
    );
    expect(dto).toBeNull();
  });

  it("4. a missing result returns null", async () => {
    const dto = await loadOfficialResultForIntegration(
      { organizationId: ORG, examResultId: "nope", sourceEvent: "PUBLICATION" },
      asClient(h.db)
    );
    expect(dto).toBeNull();
  });

  it("5. sourceFingerprint is deterministic and carries the official facts", async () => {
    seedIntegratable();
    const dto = await loadOfficialResultForIntegration(
      { organizationId: ORG, examResultId: "res-1", sourceEvent: "PUBLICATION" },
      asClient(h.db)
    );
    expect(dto!.sourceFingerprint).toBe("result:res-1|SCORED|45|60");
  });

  it("6. leaks no Prisma-only columns (remarks / checksum / marker etc.)", async () => {
    seedIntegratable();
    const dto = await loadOfficialResultForIntegration(
      { organizationId: ORG, examResultId: "res-1", sourceEvent: "PUBLICATION" },
      asClient(h.db)
    );
    const keys = Object.keys(dto!).sort();
    expect(keys).toEqual(
      [
        "currentRevisionId", "enrollmentId", "examAttemptId", "examCandidateId", "examResultId",
        "examSessionId", "levelSubjectId", "maxScore", "normalizedScore", "officialVersion",
        "organizationId", "publishedAt", "resultCode", "score", "sourceEvent", "sourceFingerprint",
        "studentId",
      ].sort()
    );
    expect(dto as unknown as Record<string, unknown>).not.toHaveProperty("remarks");
    expect(dto as unknown as Record<string, unknown>).not.toHaveProperty("resultChecksum");
    expect(dto as unknown as Record<string, unknown>).not.toHaveProperty("markerId");
  });
});

// ─── Pure mapping ─────────────────────────────────────────────────────────────

function dtoWith(over: Partial<OfficialExamResultIntegrationDto>): OfficialExamResultIntegrationDto {
  return {
    organizationId: ORG, examResultId: "res-1", currentRevisionId: null, examSessionId: "sess-1",
    examAttemptId: "att-1", examCandidateId: "cand-1", studentId: "stu-1", enrollmentId: "enr-1",
    levelSubjectId: "ls-1", resultCode: "SCORED", score: 45, maxScore: 60, normalizedScore: 75,
    publishedAt: NOW, officialVersion: "result:res-1", sourceFingerprint: "fp", sourceEvent: "PUBLICATION",
    ...over,
  };
}

describe("mapExamOutcomeToGrade (pure)", () => {
  it("7. SCORED maps 1:1 to grade / maxGrade / normalizedGrade", () => {
    const m = mapExamOutcomeToGrade(dtoWith({}));
    expect(m).toEqual({ supported: true, grade: 45, maxGrade: 60, normalizedGrade: 75 });
  });

  it("8. ABSENT is UNSUPPORTED (never a grade of 0)", () => {
    expect(mapExamOutcomeToGrade(dtoWith({ resultCode: "ABSENT", score: null, normalizedScore: null }))).toEqual({
      supported: false,
      reason: "NON_SCORED_OUTCOME",
    });
  });

  it("9. EXCUSED is UNSUPPORTED", () => {
    expect(
      mapExamOutcomeToGrade(dtoWith({ resultCode: "EXCUSED", score: null, normalizedScore: null })).supported
    ).toBe(false);
  });

  it("10. DISQUALIFIED is UNSUPPORTED", () => {
    expect(
      mapExamOutcomeToGrade(dtoWith({ resultCode: "DISQUALIFIED", score: null, normalizedScore: null })).supported
    ).toBe(false);
  });

  it("11. SCORED with null score is UNSUPPORTED", () => {
    expect(mapExamOutcomeToGrade(dtoWith({ score: null })).supported).toBe(false);
  });

  it("12. SCORED with null normalizedScore is UNSUPPORTED", () => {
    expect(mapExamOutcomeToGrade(dtoWith({ normalizedScore: null })).supported).toBe(false);
  });
});

// ─── Pure ledger helpers ──────────────────────────────────────────────────────

function evt(over: Partial<ExamEventRecord>): ExamEventRecord {
  return {
    id: "e", organizationId: ORG, aggregateType: "EXAM_RESULT", aggregateId: "res-1",
    eventType: "exam_result.integrated", previousStatus: "", newStatus: "INTEGRATED", actorId: "u-1",
    reason: null, metadata: null, createdAt: NOW, ...over,
  };
}

describe("ledger helpers (pure)", () => {
  it("13. latestIntegratedVersion of an empty stream is null", () => {
    expect(latestIntegratedVersion([])).toBeNull();
  });

  it("14. returns the last chronological integrated version", () => {
    const list = [
      evt({ id: "a", metadata: JSON.stringify({ officialVersion: "result:res-1" }) }),
      evt({
        id: "b",
        eventType: "exam_result.integration_reconciled",
        metadata: JSON.stringify({ officialVersion: "result:res-1:revision:rev-1" }),
      }),
    ];
    expect(latestIntegratedVersion(list)).toBe("result:res-1:revision:rev-1");
  });

  it("15. ignores non-integration events", () => {
    const list = [
      evt({ eventType: "exam_result.published", metadata: JSON.stringify({ officialVersion: "x" }) }),
    ];
    expect(latestIntegratedVersion(list)).toBeNull();
  });

  it("16. tolerates malformed metadata without throwing", () => {
    const list = [evt({ metadata: "{not json" })];
    expect(latestIntegratedVersion(list)).toBeNull();
  });

  it("17. gradeStateFor null ledger is MISSING", () => {
    expect(gradeStateFor("result:res-1", null)).toBe("MISSING");
  });

  it("18. gradeStateFor equal version is CURRENT", () => {
    expect(gradeStateFor("result:res-1", "result:res-1")).toBe("CURRENT");
  });

  it("19. gradeStateFor different version is STALE", () => {
    expect(gradeStateFor("result:res-1:revision:rev-1", "result:res-1")).toBe("STALE");
  });
});

// ─── Integrate a single published result ──────────────────────────────────────

describe("IntegratePublishedExamResultCommand", () => {
  it("20. integrates a base published result (gradeAction CREATED)", async () => {
    seedIntegratable();
    const r = await integrate();
    expect(r.gradeAction).toBe("CREATED");
    expect(r.gradeRecordId).toBe("grade-1");
    expect(r.officialVersion).toBe("result:res-1");
    expect(r.progressionStatus).toBe("IN_PROGRESS");
    expect(r.progressionRecalculated).toBe(true);
  });

  it("21. the grade port is invoked ONCE with the mapped fields + server actor", async () => {
    seedIntegratable();
    const grade = makeFakeGradePort();
    await integrate({}, fakePorts({ gradePort: grade.port }));
    expect(grade.calls).toHaveLength(1);
    expect(grade.calls[0]).toMatchObject({
      grade: 45, maxGrade: 60, normalizedGrade: 75,
      assessmentComponentId: "comp-1", subjectId: "subj-1",
      enrollmentId: "enr-1", levelSubjectId: "ls-1", studentId: "stu-1",
      actorId: "u-1", officialVersion: "result:res-1",
    });
  });

  it("22. progression is confirmed AFTER the grade write", async () => {
    seedIntegratable();
    await integrate();
    expect(callOrder).toEqual(["resolve", "grade", "progression"]);
  });

  it("23. writes an exam_result.integrated event carrying officialVersion in metadata", async () => {
    seedIntegratable();
    await integrate();
    const evts = eventsOf("exam_result.integrated");
    expect(evts).toHaveLength(1);
    expect((evts[0] as { aggregateType: string }).aggregateType).toBe("EXAM_RESULT");
    expect(metaOf("exam_result.integrated")[0]).toMatchObject({
      officialVersion: "result:res-1",
      gradeRecordId: "grade-1",
      gradeAction: "CREATED",
    });
  });

  it("24. writes an audit log for the integration", async () => {
    seedIntegratable();
    await integrate();
    expect(audits().some((a) => (a as { action: string }).action === "exam_result.integrated")).toBe(true);
  });

  it("25. a repeat at the same version is UNCHANGED and writes NO second event", async () => {
    seedIntegratable();
    await integrate();
    const r2 = await integrate();
    expect(r2.gradeAction).toBe("UNCHANGED");
    expect(r2.gradeRecordId).toBeNull();
    expect(eventsOf("exam_result.integrated")).toHaveLength(1);
  });

  it("26. integrates a revised result (revised score + revision version)", async () => {
    seedIntegratable({ currentRevisionId: "rev-1" });
    seedRevision();
    const grade = makeFakeGradePort("UPDATED");
    const r = await integrate({}, fakePorts({ gradePort: grade.port }));
    expect(r.officialVersion).toBe("result:res-1:revision:rev-1");
    expect(r.currentRevisionId).toBe("rev-1");
    expect(grade.calls[0]).toMatchObject({ grade: 54, normalizedGrade: 90 });
  });

  it("27. an unpublished result → EXAM_RESULT_NOT_PUBLISHED", async () => {
    seedIntegratable({ status: "APPROVED" });
    await expect(integrate()).rejects.toThrowError(/EXAM_RESULT_NOT_PUBLISHED/);
  });

  it("28. a missing result → OFFICIAL_RESULT_NOT_FOUND", async () => {
    await expect(integrate()).rejects.toThrowError(/OFFICIAL_RESULT_NOT_FOUND/);
  });

  it("29. a cross-tenant result is hidden → OFFICIAL_RESULT_NOT_FOUND", async () => {
    seedIntegratable();
    await expect(integrate({}, fakePorts(), otherCtx)).rejects.toThrowError(/OFFICIAL_RESULT_NOT_FOUND/);
  });

  it("30. requires exams.integrateResults", async () => {
    seedIntegratable();
    authState.allow = false;
    await expect(integrate()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.integrateResults");
  });

  it("31. a non-scored (ABSENT) outcome → UNSUPPORTED; grade port NOT called; no event", async () => {
    seedIntegratable({ resultCode: "ABSENT", score: null, normalizedScore: null });
    const grade = makeFakeGradePort();
    await expect(integrate({}, fakePorts({ gradePort: grade.port }))).rejects.toThrowError(
      /EXAM_RESULT_INTEGRATION_UNSUPPORTED/
    );
    expect(grade.calls).toHaveLength(0);
    expect(eventsOf("exam_result.integrated")).toHaveLength(0);
  });

  it("32. actor ids are never taken from input (actorId key rejected)", async () => {
    seedIntegratable();
    await expect(
      new IntegratePublishedExamResultCommand(
        { examResultId: "res-1", actorId: "hacker" } as never,
        ctx,
        fakePorts()
      ).run()
    ).rejects.toThrowError(/inválidos/i);
  });

  it("33. writes NO Grade / Transcript / Certificate table directly", async () => {
    seedIntegratable();
    await integrate();
    expect(store("studentAssessmentResult")).toHaveLength(0);
    expect(store("studentSubjectProgress")).toHaveLength(0);
    expect(store("academicTranscript")).toHaveLength(0);
    expect(store("certificate")).toHaveLength(0);
  });

  it("34. the DEFAULT (production) resolver returns null → UNSUPPORTED (the gate)", async () => {
    seedIntegratable();
    await expect(
      new IntegratePublishedExamResultCommand({ examResultId: "res-1" }, ctx).run()
    ).rejects.toThrowError(/EXAM_RESULT_INTEGRATION_UNSUPPORTED/);
    expect(eventsOf("exam_result.integrated")).toHaveLength(0);
  });

  it("35. a concurrent official-version change aborts → OFFICIAL_RESULT_CHANGED", async () => {
    seedIntegratable();
    seedRevision();
    // Bump the official version between the first load and the re-read guard.
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

  it("36. a grade-port failure → EXAM_RESULT_INTEGRATION_FAILED; progression NOT called", async () => {
    seedIntegratable();
    const grade = makeFakeGradePort("CREATED", new Error("db down"));
    const prog = makeFakeProgression();
    await expect(integrate({}, fakePorts({ gradePort: grade.port, progressionPort: prog.port }))).rejects.toThrowError(
      /EXAM_RESULT_INTEGRATION_FAILED/
    );
    expect(prog.calls).toHaveLength(0);
    expect(eventsOf("exam_result.integrated")).toHaveLength(0);
  });

  it("37. a grade-port BusinessRuleError propagates unchanged", async () => {
    seedIntegratable();
    const { BusinessRuleError } = await import("@/shared/lib/command");
    const grade = makeFakeGradePort("CREATED", new BusinessRuleError("GRADE_LOCKED"));
    await expect(integrate({}, fakePorts({ gradePort: grade.port }))).rejects.toThrowError(/GRADE_LOCKED/);
  });

  it("38. a progression failure → PROGRESSION_RECALCULATION_FAILED", async () => {
    seedIntegratable();
    const prog = makeFakeProgression("IN_PROGRESS", new Error("cascade boom"));
    await expect(integrate({}, fakePorts({ progressionPort: prog.port }))).rejects.toThrowError(
      /PROGRESSION_RECALCULATION_FAILED/
    );
    expect(eventsOf("exam_result.integrated")).toHaveLength(0);
  });

  it("39. rollback on a failed event write leaves no event / audit", async () => {
    seedIntegratable();
    h.db.examEvent.create = async () => {
      throw new Error("boom");
    };
    await expect(integrate()).rejects.toThrow(/boom/);
    expect(events()).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("40. the reason is forwarded to the grade port", async () => {
    seedIntegratable();
    const grade = makeFakeGradePort();
    await integrate({ reason: "integração oficial" }, fakePorts({ gradePort: grade.port }));
    expect(grade.calls[0].reason).toBe("integração oficial");
  });
});

// ─── Reconcile ──────────────────────────────────────────────────────────────

const reconcile = (input: Record<string, unknown> = {}, ports = fakePorts(), context = ctx) =>
  new ReconcileExamResultIntegrationCommand({ examResultId: "res-1", ...input }, context, ports).run();

describe("ReconcileExamResultIntegrationCommand", () => {
  it("41. dry-run (default) on a never-integrated result → MISSING, wouldChange, no write", async () => {
    seedIntegratable();
    const r = await reconcile();
    expect(r.gradeState).toBe("MISSING");
    expect(r.wouldChange).toBe(true);
    expect(r.changed).toBe(false);
    expect(r.progressionState).toBe("REQUIRES_RECALCULATION");
    expect(eventsOf("exam_result.integration_reconciled")).toHaveLength(0);
  });

  it("42. dry-run after integration at the current version → CURRENT / no change", async () => {
    seedIntegratable();
    await integrate();
    const r = await reconcile();
    expect(r.gradeState).toBe("CURRENT");
    expect(r.wouldChange).toBe(false);
    expect(r.progressionState).toBe("CURRENT");
  });

  it("43. a superseding revision makes the ledger STALE (dry-run)", async () => {
    seedIntegratable();
    await integrate();
    // A CURRENT revision now supersedes the integrated base version.
    seedRevision();
    h.db.examResult.__store[0].currentRevisionId = "rev-1";
    const r = await reconcile();
    expect(r.gradeState).toBe("STALE");
    expect(r.wouldChange).toBe(true);
  });

  it("44. live reconciliation repairs a STALE result (integration_reconciled event)", async () => {
    seedIntegratable();
    await integrate();
    seedRevision();
    h.db.examResult.__store[0].currentRevisionId = "rev-1";
    const grade = makeFakeGradePort("UPDATED");
    const r = await reconcile({ dryRun: false }, fakePorts({ gradePort: grade.port }));
    expect(r.changed).toBe(true);
    expect(r.progressionState).toBe("CURRENT");
    expect(grade.calls[0]).toMatchObject({ grade: 54, officialVersion: "result:res-1:revision:rev-1" });
    expect(metaOf("exam_result.integration_reconciled")[0]).toMatchObject({
      officialVersion: "result:res-1:revision:rev-1",
    });
  });

  it("45. an unsupported outcome → gradeState UNSUPPORTED, NOT_RUN, no change", async () => {
    seedIntegratable({ resultCode: "ABSENT", score: null, normalizedScore: null });
    const r = await reconcile();
    expect(r.gradeState).toBe("UNSUPPORTED");
    expect(r.wouldChange).toBe(false);
    expect(r.progressionState).toBe("NOT_RUN");
  });

  it("46. live reconciliation with the production resolver collects UNSUPPORTED (no change)", async () => {
    seedIntegratable();
    const r = await new ReconcileExamResultIntegrationCommand(
      { examResultId: "res-1", dryRun: false },
      ctx
    ).run();
    expect(r.changed).toBe(false);
    expect(r.errors).toContain("EXAM_RESULT_INTEGRATION_UNSUPPORTED");
  });

  it("47. a grade-port failure during reconciliation is captured (sanitised), not thrown", async () => {
    seedIntegratable();
    const grade = makeFakeGradePort("CREATED", new Error("db down"));
    const r = await reconcile({ dryRun: false }, fakePorts({ gradePort: grade.port }));
    expect(r.changed).toBe(false);
    expect(r.errors).toContain("INTERNAL_ERROR");
    expect(eventsOf("exam_result.integration_reconciled")).toHaveLength(0);
  });

  it("48. an unpublished result → EXAM_RESULT_NOT_PUBLISHED", async () => {
    seedIntegratable({ status: "APPROVED" });
    await expect(reconcile()).rejects.toThrowError(/EXAM_RESULT_NOT_PUBLISHED/);
  });
});

// ─── Retraction guard (Phase 9 command, Phase 11 rule) ────────────────────────

function seedRetractable(): void {
  seed(h.db, "examSession", {
    id: "sess-1", organizationId: ORG, periodId: "per-1", branchId: null, courseId: null,
    courseLevelId: null, levelSubjectId: "ls-1", roomId: null, title: "Exame",
    status: "PUBLISHED", startsAt: NOW, endsAt: NOW, capacity: 20, instructions: null,
    lockedAt: null, startedAt: null, completedAt: null, publishedAt: NOW, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, publishedById: "u-0", cancelledById: null,
    deletedAt: null,
  });
  seedCandidate();
  seedResult({ status: "PUBLISHED", publishedAt: NOW });
  seed(h.db, "examPublication", {
    id: "pub-1", organizationId: ORG, examSessionId: "sess-1", status: "PUBLISHED",
    publishedAt: NOW, publishedById: "u-0", retractedAt: null, retractedById: null, reason: null,
  });
}

describe("retraction consumption guard", () => {
  it("49. a retraction after integration → PUBLICATION_ALREADY_CONSUMED", async () => {
    seedRetractable();
    seed(h.db, "examEvent", {
      id: "e-int", organizationId: ORG, aggregateType: "EXAM_RESULT", aggregateId: "res-1",
      eventType: "exam_result.integrated", previousStatus: "", newStatus: "INTEGRATED",
      actorId: "u-1", reason: null, metadata: JSON.stringify({ officialVersion: "result:res-1" }),
    });
    await expect(
      new RetractExamSessionPublicationCommand(
        { examSessionId: "sess-1", reason: "erro" },
        ctx
      ).run()
    ).rejects.toThrowError(/PUBLICATION_ALREADY_CONSUMED/);
    expect(store("examPublication")[0].status).toBe("PUBLISHED");
  });

  it("50. a non-integrated publication still retracts (Phase 9 behaviour intact)", async () => {
    seedRetractable();
    const r = await new RetractExamSessionPublicationCommand(
      { examSessionId: "sess-1", reason: "erro" },
      ctx
    ).run();
    expect(r.publicationStatus).toBe("RETRACTED");
    expect(store("examResult")[0].status).toBe("APPROVED");
  });
});

// ─── Session batch ────────────────────────────────────────────────────────────

function seedSessionBatch(): void {
  seed(h.db, "examSession", {
    id: "sess-1", organizationId: ORG, periodId: "per-1", branchId: null, courseId: null,
    courseLevelId: null, levelSubjectId: "ls-1", roomId: null, title: "Exame",
    status: "PUBLISHED", startsAt: NOW, endsAt: NOW, capacity: 20, instructions: null,
    lockedAt: null, startedAt: null, completedAt: null, publishedAt: NOW, cancelledAt: null,
    createdById: "u-0", lockedById: null, completedById: null, publishedById: "u-0", cancelledById: null,
    deletedAt: null,
  });
  seedCandidate({ id: "cand-1" });
  seedCandidate({ id: "cand-2", studentId: "stu-2", enrollmentId: "enr-2" });
  seedResult({ id: "res-1", examCandidateId: "cand-1", studentId: "stu-1", enrollmentId: "enr-1" });
  seedResult({ id: "res-2", examCandidateId: "cand-2", studentId: "stu-2", enrollmentId: "enr-2" });
}

const runBatch = (input: Record<string, unknown> = {}, ports = fakePorts(), context = ctx) =>
  new IntegrateExamSessionResultsCommand({ examSessionId: "sess-1", ...input }, context, ports).run();

describe("IntegrateExamSessionResultsCommand", () => {
  it("51. integrates every published result sequentially (counts invariant)", async () => {
    seedSessionBatch();
    const r = await runBatch();
    expect(r.total).toBe(2);
    expect(r.succeeded).toBe(2);
    expect(r.failed).toBe(0);
    expect(r.skipped).toBe(0);
    expect(r.total).toBe(r.succeeded + r.failed + r.skipped);
  });

  it("52. captures a per-item failure while others succeed (partial success)", async () => {
    seedSessionBatch();
    h.db.examResult.__store[1].resultCode = "ABSENT";
    h.db.examResult.__store[1].score = null;
    h.db.examResult.__store[1].normalizedScore = null;
    const r = await runBatch();
    expect(r.succeeded).toBe(1);
    expect(r.failed).toBe(1);
    const failed = r.items.find((i) => !i.ok)!;
    expect(failed.code).toBe("EXAM_RESULT_INTEGRATION_UNSUPPORTED");
  });

  it("53. stopOnFailure skips the remaining items after the first failure", async () => {
    seedSessionBatch();
    // Make the FIRST processed result fail (findResultsBySession orders createdAt desc, id asc).
    h.db.examResult.__store[0].resultCode = "ABSENT";
    h.db.examResult.__store[0].score = null;
    h.db.examResult.__store[0].normalizedScore = null;
    h.db.examResult.__store[1].resultCode = "ABSENT";
    h.db.examResult.__store[1].score = null;
    h.db.examResult.__store[1].normalizedScore = null;
    const r = await runBatch({ stopOnFailure: true });
    expect(r.failed).toBe(1);
    expect(r.skipped).toBe(1);
    expect(r.succeeded).toBe(0);
  });

  it("54. a non-published session → SESSION_NOT_PUBLISHED", async () => {
    seedSessionBatch();
    h.db.examSession.__store[0].status = "RESULTS_RECORDED";
    await expect(runBatch()).rejects.toThrowError(/SESSION_NOT_PUBLISHED/);
  });

  it("55. delegates to the single command (writes one integrated event per result)", async () => {
    seedSessionBatch();
    await runBatch();
    expect(eventsOf("exam_result.integrated")).toHaveLength(2);
  });

  it("56. requires exams.integrateResults", async () => {
    seedSessionBatch();
    authState.allow = false;
    await expect(runBatch()).rejects.toBeInstanceOf(AuthorizationError);
    expect(authState.checked).toContain("exams.integrateResults");
  });
});
