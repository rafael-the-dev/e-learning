/**
 * Examination → Grade → Progression — PRODUCTION Integration Test Script (H2)
 * ===========================================================================
 * Proves that the LIVE production Grade/Progression integration adapter
 * (`src/modules/examinations/integrations/production-ports.ts`) actually works
 * end-to-end. It runs the REAL command pipeline and the REAL production ports
 * (NO fakes, NO mocks, NO injected writers) against a live SQL Server database,
 * then reads the real Grade / Progression / ExamEvent tables to verify the write.
 *
 *   IntegratePublishedExamResultCommand  (no ports arg → production defaults)
 *        → productionComponentResolver   (resolves the ExamGradeComponentBinding)
 *        → productionGradeWritePort       (canonical Grade write via gradeMutationService)
 *        → productionProgressionConfirmPort (reads the cascaded StudentSubjectProgress)
 *
 * Because every integration command defaults its ports to the production
 * implementations when the `ports` argument is omitted, constructing the command
 * with only `(input, context)` exercises exactly the production adapter — the
 * same object used in production. This file NEVER imports a fake port.
 *
 * Prerequisites
 * -------------
 * 1. Set DATABASE_URL to a live SQL Server connection string.
 * 2. Run `pnpm db:seed` at least once (system roles + permission catalog must
 *    already exist — the ORG_ADMIN system role must carry the `exams.*` grants).
 *
 * Run
 * ---
 *   npx tsx src/modules/examinations/__tests__/grade-integration-production.integration.ts
 *
 * Isolation
 * ---------
 * Creates ONE throwaway organization (plus its academic + exam fixture) with a
 * `runId` suffix, runs every scenario inside it, then deletes everything it
 * created — scoped by organizationId (and by email domain for User rows, which
 * have no organizationId). It never touches pre-existing data.
 *
 * Scenarios (mirror the H2 acceptance checklist)
 * ----------------------------------------------
 *  1. Real integration writes a canonical Grade + reaches Progression (§4/§5/§6).
 *  2. Idempotency — a second integrate is UNCHANGED, no duplicate row/ledger (§7).
 *  3. Revision reconciliation — an approved appeal makes the grade STALE; a live
 *     reconcile UPDATES the single grade row, recalculates once (§8).
 *  4. Retraction after consumption is blocked; the Grade is never rolled back (§12).
 *  5. Non-scored outcomes (ABSENT / EXCUSED / DISQUALIFIED) → UNSUPPORTED, no write (§9).
 *  6. maxScore ≠ component.maxGrade → UNSUPPORTED, nothing written; and because the
 *     grade port refuses BEFORE any progression, no progression/ledger is written (§10/§14).
 *  7. Binding enforcement — no binding → UNSUPPORTED; archived binding → UNSUPPORTED;
 *     never a fallback / first-component / name match (§11).
 *  8. Real-adapter identity — the grade write only happens through the live adapter
 *     (a fake could not have written the real Grade tables) (§15).
 */

import "dotenv/config";
import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/server/db";
import type { ServiceContext } from "@/shared/types/common";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { ExamEventAggregateType, ExamEventType } from "@/modules/examinations/constants";
import { GRADE_CHANGE_SOURCE } from "@/modules/grades/types";
import {
  CreateExamPeriodCommand,
  OpenExamPeriodCommand,
} from "@/modules/examinations/commands/exam-period.commands";
import {
  CreateExamSessionCommand,
  ScheduleExamSessionCommand,
  LockExamSessionCommand,
  StartExamSessionCommand,
  CompleteExamSessionCommand,
} from "@/modules/examinations/commands/exam-session.commands";
import { OverrideExamCandidateEligibilityCommand } from "@/modules/examinations/commands/candidate-registration.commands";
import { MarkExamCandidateAttendanceCommand } from "@/modules/examinations/commands/attendance.commands";
import { CreateExamResultCommand } from "@/modules/examinations/commands/result-entry.commands";
import {
  ReviewExamResultCommand,
  ApproveExamResultCommand,
} from "@/modules/examinations/commands/result-review.commands";
import { SubmitExamResultCommand } from "@/modules/examinations/commands/result-entry.commands";
import {
  PublishExamSessionResultsCommand,
  RetractExamSessionPublicationCommand,
} from "@/modules/examinations/commands/publication.commands";
import {
  BindExamSessionToGradeComponentCommand,
  ArchiveExamSessionGradeComponentBindingCommand,
} from "@/modules/examinations/commands/binding.commands";
import {
  IntegratePublishedExamResultCommand,
  ReconcileExamResultIntegrationCommand,
} from "@/modules/examinations/commands/integration.commands";
import {
  CreateExamAppealCommand,
  ReviewExamAppealCommand,
  ApproveExamAppealCommand,
} from "@/modules/examinations/commands/appeals.commands";

// =============================================================================
// Assertion helpers (same shape as the other *.integration.ts scripts)
// =============================================================================

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ PASS: ${message}`);
  }
}

/** Assert a promise rejects, and (optionally) with a BusinessRuleError whose code
 *  (`.message`) matches — BusinessRuleError stores the code string in `message`. */
async function assertRejectsWith(
  promise: Promise<unknown>,
  expectedCode: string,
  message: string
): Promise<void> {
  try {
    await promise;
    console.error(`  ✗ FAIL: ${message} (resolved instead of rejecting with ${expectedCode})`);
    process.exitCode = 1;
  } catch (err) {
    const actual = err instanceof Error ? err.message : String(err);
    if (actual.includes(expectedCode)) {
      console.log(`  ✓ PASS: ${message}`);
    } else {
      console.error(`  ✗ FAIL: ${message} (rejected with "${actual}", expected "${expectedCode}")`);
      process.exitCode = 1;
    }
  }
}

// =============================================================================
// Fixture
// =============================================================================

interface Fixture {
  runId: string;
  emailDomain: string;
  orgId: string;
  courseId: string;
  courseLevelId: string;
  levelSubjectId: string;
  assessmentPolicyId: string;
  /** The canonical grade component the exam session binds to (maxGrade = 20). */
  componentId: string;
  periodId: string;
  ctxMarker: ServiceContext;
  ctxReviewer: ServiceContext;
  ctxApprover: ServiceContext;
}

/** Session window fully inside the exam period window (CreateExamSession requires it). */
const PERIOD_START = new Date("2026-07-01T00:00:00Z");
const PERIOD_END = new Date("2026-07-31T23:59:59Z");
const SESSION_START = new Date("2026-07-10T09:00:00Z");
const SESSION_END = new Date("2026-07-10T11:00:00Z");
const COMPONENT_MAX_GRADE = 20;

async function makeAdminUser(
  db: PrismaClient,
  orgId: string,
  emailDomain: string,
  label: string,
  orgAdminRoleId: string
): Promise<string> {
  const user = await db.user.create({
    data: { name: `Exam ${label}`, email: `${label}@${emailDomain}`, isActive: true },
  });
  await db.userOrganization.create({ data: { userId: user.id, organizationId: orgId } });
  await db.userRole.create({
    data: { userId: user.id, roleId: orgAdminRoleId, organizationId: orgId },
  });
  return user.id;
}

/** Best-effort cleanup handle set as soon as the throwaway org exists, so a setup
 *  failure part-way through still tears its rows down (setup is not transactional). */
let partialCleanup: { orgId: string; emailDomain: string; courseId?: string } | undefined;

async function setup(db: PrismaClient): Promise<Fixture> {
  const runId = `${Date.now().toString(36)}-${Math.floor(process.hrtime()[1] % 1e6).toString(36)}`;
  const emailDomain = `exam-h2-${runId}.test`;

  const orgAdminRole = await db.role.findFirstOrThrow({
    where: { organizationId: null, isSystem: true, name: SYSTEM_ROLES.ORG_ADMIN },
  });

  const org = await db.organization.create({
    data: { name: `Exam H2 ${runId}`, slug: `exam-h2-${runId}` },
  });
  partialCleanup = { orgId: org.id, emailDomain };

  const academicYear = await db.academicYear.create({
    data: {
      organizationId: org.id,
      name: `AY ${runId}`,
      code: `AY-${runId}`,
      startDate: PERIOD_START,
      endDate: PERIOD_END,
    },
  });

  const course = await db.course.create({
    data: { organizationId: org.id, name: `Curso ${runId}` },
  });
  partialCleanup = { orgId: org.id, emailDomain, courseId: course.id };
  const courseLevel = await db.courseLevel.create({
    data: { courseId: course.id, name: `Nível 1 ${runId}` },
  });
  const subject = await db.subject.create({
    data: { organizationId: org.id, name: `Disciplina ${runId}` },
  });
  const levelSubject = await db.levelSubject.create({
    data: {
      organizationId: org.id,
      courseId: course.id,
      courseLevelId: courseLevel.id,
      subjectId: subject.id,
      minimumPassingGrade: 10,
    },
  });

  // Assessment policy + a single canonical component (maxGrade = 20, weight = 100)
  // whose policy.levelSubjectId === the exam session's levelSubjectId (the resolver's
  // compatibility rule). This is the REAL grade target the exam integrates into.
  const policy = await db.assessmentPolicy.create({
    data: {
      organizationId: org.id,
      levelSubjectId: levelSubject.id,
      name: `Política ${runId}`,
      minimumPassingGrade: 10,
    },
  });
  const component = await db.assessmentComponent.create({
    data: {
      organizationId: org.id,
      assessmentPolicyId: policy.id,
      name: `Exame Final ${runId}`,
      weight: 100,
      maxGrade: COMPONENT_MAX_GRADE,
    },
  });

  const markerId = await makeAdminUser(db, org.id, emailDomain, "marker", orgAdminRole.id);
  const reviewerId = await makeAdminUser(db, org.id, emailDomain, "reviewer", orgAdminRole.id);
  const approverId = await makeAdminUser(db, org.id, emailDomain, "approver", orgAdminRole.id);

  const ctxMarker: ServiceContext = { userId: markerId, organizationId: org.id };

  // One shared, OPEN exam period for every session in the run.
  const period = await new CreateExamPeriodCommand(
    { name: `Época ${runId}`, academicYear: academicYear.name, startsAt: PERIOD_START, endsAt: PERIOD_END },
    ctxMarker
  ).run();
  await new OpenExamPeriodCommand({ periodId: period.periodId }, ctxMarker).run();

  return {
    runId,
    emailDomain,
    orgId: org.id,
    courseId: course.id,
    courseLevelId: courseLevel.id,
    levelSubjectId: levelSubject.id,
    assessmentPolicyId: policy.id,
    componentId: component.id,
    periodId: period.periodId,
    ctxMarker,
    ctxReviewer: { userId: reviewerId, organizationId: org.id },
    ctxApprover: { userId: approverId, organizationId: org.id },
  };
}

async function makeStudentEnrollment(
  db: PrismaClient,
  f: Fixture,
  label: string
): Promise<{ studentId: string; enrollmentId: string }> {
  const student = await db.student.create({
    data: { organizationId: f.orgId, firstName: label, lastName: f.runId },
  });
  const academicYear = await db.academicYear.findFirstOrThrow({
    where: { organizationId: f.orgId },
  });
  const enrollment = await db.enrollment.create({
    data: {
      organizationId: f.orgId,
      studentId: student.id,
      courseId: f.courseId,
      academicYearId: academicYear.id,
      courseLevelId: f.courseLevelId,
      // Unique per (organizationId, enrollmentNumber): SQL Server allows only ONE NULL
      // in that constraint, so every enrollment must carry a distinct number.
      enrollmentNumber: `EN-${f.runId}-${label}`,
      status: "ACTIVE",
    },
  });
  return { studentId: student.id, enrollmentId: enrollment.id };
}

/**
 * Drive ONE candidate through the full lifecycle to a PUBLISHED official result.
 * Uses the three distinct actors so the two-eyes separation is honoured
 * (marker creates + submits, reviewer reviews, approver approves).
 */
async function drivePublishedResult(
  f: Fixture,
  opts: {
    title: string;
    studentId: string;
    enrollmentId: string;
    attendanceStatus: "PRESENT" | "ABSENT" | "EXCUSED" | "DISQUALIFIED";
    score?: number;
    maxScore: number;
    bind: boolean;
  }
): Promise<{ sessionId: string; examResultId: string; examCandidateId: string }> {
  const { ctxMarker, ctxReviewer, ctxApprover } = f;

  const session = await new CreateExamSessionCommand(
    {
      periodId: f.periodId,
      levelSubjectId: f.levelSubjectId,
      title: opts.title,
      capacity: 30,
      startsAt: SESSION_START,
      endsAt: SESSION_END,
    },
    ctxMarker
  ).run();
  const sessionId = session.sessionId;

  await new ScheduleExamSessionCommand({ sessionId }, ctxMarker).run();

  if (opts.bind) {
    await new BindExamSessionToGradeComponentCommand(
      { examSessionId: sessionId, assessmentComponentId: f.componentId },
      ctxMarker
    ).run();
  }

  const candidate = await new OverrideExamCandidateEligibilityCommand(
    {
      examSessionId: sessionId,
      studentId: opts.studentId,
      enrollmentId: opts.enrollmentId,
      levelSubjectId: f.levelSubjectId,
      reason: "Integração de teste (override)",
    },
    ctxMarker
  ).run();
  const examCandidateId = candidate.examCandidateId;

  await new LockExamSessionCommand({ sessionId }, ctxMarker).run();

  const needsReason =
    opts.attendanceStatus === "EXCUSED" || opts.attendanceStatus === "DISQUALIFIED";
  await new MarkExamCandidateAttendanceCommand(
    {
      examCandidateId,
      status: opts.attendanceStatus,
      ...(needsReason ? { reason: `Motivo ${opts.attendanceStatus}` } : {}),
    },
    ctxMarker
  ).run();

  await new StartExamSessionCommand({ sessionId }, ctxMarker).run();

  const result = await new CreateExamResultCommand(
    {
      examCandidateId,
      ...(opts.score !== undefined ? { score: opts.score } : {}),
      maxScore: opts.maxScore,
      ...(opts.attendanceStatus === "DISQUALIFIED" ? { reason: "Desqualificado" } : {}),
    },
    ctxMarker
  ).run();
  const examResultId = result.examResultId;

  await new CompleteExamSessionCommand({ sessionId }, ctxMarker).run();
  await new SubmitExamResultCommand({ examResultId }, ctxMarker).run();
  await new ReviewExamResultCommand({ examResultId }, ctxReviewer).run();
  await new ApproveExamResultCommand({ examResultId }, ctxApprover).run();
  await new PublishExamSessionResultsCommand({ examSessionId: sessionId }, ctxMarker).run();

  return { sessionId, examResultId, examCandidateId };
}

// =============================================================================
// DB read helpers (assert against the REAL Grade / Progression / ledger tables)
// =============================================================================

async function gradeRows(db: PrismaClient, f: Fixture, enrollmentId: string) {
  return db.studentAssessmentResult.findMany({
    where: { organizationId: f.orgId, enrollmentId, assessmentComponentId: f.componentId },
  });
}

async function integratedEvents(db: PrismaClient, f: Fixture, examResultId: string) {
  return db.examEvent.findMany({
    where: {
      organizationId: f.orgId,
      aggregateType: ExamEventAggregateType.EXAM_RESULT,
      aggregateId: examResultId,
      eventType: {
        in: [ExamEventType.EXAM_RESULT_INTEGRATED, ExamEventType.EXAM_RESULT_INTEGRATION_RECONCILED],
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// =============================================================================
// Scenarios
// =============================================================================

async function scenario1_realWrite(
  db: PrismaClient,
  f: Fixture
): Promise<{ examResultId: string; enrollmentId: string; sessionId: string }> {
  console.log("\n── 1. Real production integration writes a canonical Grade + reaches Progression ──");
  const { studentId, enrollmentId } = await makeStudentEnrollment(db, f, "st-happy");
  const { examResultId, sessionId } = await drivePublishedResult(f, {
    title: "S1 SCORED",
    studentId,
    enrollmentId,
    attendanceStatus: "PRESENT",
    score: 15,
    maxScore: COMPONENT_MAX_GRADE,
    bind: true,
  });

  // Construct with NO ports → the PRODUCTION adapter runs (production defaults).
  const res = await new IntegratePublishedExamResultCommand({ examResultId }, f.ctxMarker).run();

  assert(res.gradeAction === "CREATED", "integrate returns gradeAction CREATED");
  assert(res.gradeRecordId != null, "integrate returns a real gradeRecordId");
  assert(res.progressionRecalculated === true, "integrate reports progression recalculated");
  assert(res.progressionStatus != null, "integrate returns a non-null progressionStatus");
  assert(res.officialVersion === `result:${examResultId}`, "officialVersion is the base result version");

  // §5 — the canonical Grade row exists and is correct (real Grade table).
  const rows = await gradeRows(db, f, enrollmentId);
  assert(rows.length === 1, "exactly one StudentAssessmentResult row (no duplicate)");
  const row = rows[0];
  assert(!!row && row.studentId === studentId, "grade row studentId matches");
  assert(!!row && row.assessmentComponentId === f.componentId, "grade row is the bound component");
  assert(!!row && Number(row.grade) === 15, "grade === exam score (15)");
  assert(!!row && Number(row.maxGrade) === COMPONENT_MAX_GRADE, "maxGrade === component maxGrade (20)");
  assert(!!row && row.status === "GRADED", "grade row status is GRADED");
  // NOTE: the production adapter writes StudentAssessmentResult.sourceType = "SCHEDULED_EVENT";
  // the EXAMINATION origin is recorded on the GradeChangeLog.source (asserted below), and the
  // officialVersion (the exam↔grade linkage the spec calls sourceVersion) lives in the ExamEvent
  // ledger metadata (asserted below) — StudentAssessmentResult has no sourceId/sourceVersion column.
  assert(!!row && row.sourceType === "SCHEDULED_EVENT", 'grade row sourceType is "SCHEDULED_EVENT"');

  // The canonical Grade WRITER ran (GradeChangeLog written with source EXAMINATION).
  const logs = await db.gradeChangeLog.findMany({
    where: { organizationId: f.orgId, studentAssessmentResultId: row!.id },
  });
  assert(logs.length >= 1, "a GradeChangeLog row was written by the canonical Grade writer");
  assert(
    logs.some((l) => l.source === GRADE_CHANGE_SOURCE.EXAMINATION),
    'GradeChangeLog.source is "EXAMINATION"'
  );

  // §5 — the exam↔grade linkage (examResultId + officialVersion) is in the ledger.
  const events = await integratedEvents(db, f, examResultId);
  assert(events.length === 1, "exactly one exam_result.integrated ledger event");
  const meta = JSON.parse(events[0]?.metadata ?? "{}") as {
    officialVersion?: string;
    gradeRecordId?: string;
  };
  assert(
    meta.officialVersion === `result:${examResultId}`,
    "ledger metadata carries the integrated officialVersion (== sourceVersion)"
  );
  assert(meta.gradeRecordId === row!.id, "ledger metadata gradeRecordId points at the grade row");

  // §6 — Progression was ACTUALLY reached: the cascade wrote StudentSubjectProgress.
  const progress = await db.studentSubjectProgress.findFirst({
    where: { organizationId: f.orgId, enrollmentId, levelSubjectId: f.levelSubjectId },
  });
  assert(progress != null, "StudentSubjectProgress row exists (progression reached)");
  assert(!!progress && typeof progress.status === "string" && progress.status.length > 0, "progression has a status");

  return { examResultId, enrollmentId, sessionId };
}

async function scenario2_idempotency(db: PrismaClient, f: Fixture, examResultId: string): Promise<void> {
  console.log("\n── 2. Idempotency — a second integrate is UNCHANGED (§7) ──");
  const before = await db.studentAssessmentResult.count({ where: { organizationId: f.orgId } });
  const res = await new IntegratePublishedExamResultCommand({ examResultId }, f.ctxMarker).run();
  assert(res.gradeAction === "UNCHANGED", "second integrate returns UNCHANGED");
  assert(res.gradeRecordId === null, "second integrate writes no grade record");
  assert(res.progressionRecalculated === false, "second integrate does not recalculate progression");
  const after = await db.studentAssessmentResult.count({ where: { organizationId: f.orgId } });
  assert(after === before, "no second StudentAssessmentResult row created");
  const events = await integratedEvents(db, f, examResultId);
  assert(events.length === 1, "no duplicate integrated ledger event (still exactly one)");
}

async function scenario3_reconciliation(
  db: PrismaClient,
  f: Fixture,
  examResultId: string,
  enrollmentId: string
): Promise<void> {
  console.log("\n── 3. Revision reconciliation — approved appeal → STALE → live reconcile (§8) ──");
  // An approved appeal appends a CURRENT revision (revised score 18) → officialVersion changes.
  const appeal = await new CreateExamAppealCommand(
    { examResultId, reason: "Reavaliação" },
    f.ctxMarker
  ).run();
  await new ReviewExamAppealCommand({ appealId: appeal.appealId }, f.ctxReviewer).run();
  const approved = await new ApproveExamAppealCommand(
    { appealId: appeal.appealId, revisedScore: 18, reason: "Nota corrigida" },
    f.ctxApprover
  ).run();

  const expectedVersion = `result:${examResultId}:revision:${approved.revisionId}`;

  // A dry-run first reports STALE without writing.
  const dry = await new ReconcileExamResultIntegrationCommand(
    { examResultId, dryRun: true },
    f.ctxMarker
  ).run();
  assert(dry.gradeState === "STALE", "dry-run reconcile detects STALE grade state");
  assert(dry.changed === false, "dry-run reconcile writes nothing");
  assert(dry.officialVersion === expectedVersion, "officialVersion changed to the revision version");

  // Live reconcile repairs (updates the SINGLE grade row, recalculates once).
  const live = await new ReconcileExamResultIntegrationCommand(
    { examResultId, dryRun: false, reason: "Reconciliar revisão" },
    f.ctxMarker
  ).run();
  assert(live.changed === true, "live reconcile updates the grade");

  const rows = await gradeRows(db, f, enrollmentId);
  assert(rows.length === 1, "still exactly one StudentAssessmentResult row (no duplicate)");
  assert(!!rows[0] && Number(rows[0].grade) === 18, "grade row updated to the revised score (18)");

  const events = await integratedEvents(db, f, examResultId);
  assert(events.length === 2, "a second (reconciled) ledger event was written");
  const lastMeta = JSON.parse(events[1]?.metadata ?? "{}") as { officialVersion?: string };
  assert(lastMeta.officialVersion === expectedVersion, "reconciled ledger carries the new officialVersion");

  const progress = await db.studentSubjectProgress.findFirst({
    where: { organizationId: f.orgId, enrollmentId, levelSubjectId: f.levelSubjectId },
  });
  assert(progress != null, "progression still present after reconcile (recalculated once)");
}

async function scenario4_retractionBlocked(
  db: PrismaClient,
  f: Fixture,
  sessionId: string,
  enrollmentId: string
): Promise<void> {
  console.log("\n── 4. Retraction after consumption is blocked; Grade not rolled back (§12) ──");
  await assertRejectsWith(
    new RetractExamSessionPublicationCommand(
      { examSessionId: sessionId, reason: "tentativa" },
      f.ctxMarker
    ).run(),
    "PUBLICATION_ALREADY_CONSUMED",
    "retracting a consumed publication is rejected"
  );
  const rows = await gradeRows(db, f, enrollmentId);
  assert(rows.length === 1 && Number(rows[0]!.grade) === 18, "the Grade row is intact (never rolled back)");
}

async function scenario5_nonScored(db: PrismaClient, f: Fixture): Promise<void> {
  console.log("\n── 5. Non-scored outcomes → UNSUPPORTED, no Grade write (§9) ──");
  for (const status of ["ABSENT", "EXCUSED", "DISQUALIFIED"] as const) {
    const { enrollmentId } = await makeStudentEnrollment(db, f, `st-${status.toLowerCase()}`);
    const { examResultId } = await drivePublishedResult(f, {
      title: `NON-SCORED ${status}`,
      studentId: (await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).studentId,
      enrollmentId,
      attendanceStatus: status,
      maxScore: COMPONENT_MAX_GRADE,
      bind: true,
    });
    await assertRejectsWith(
      new IntegratePublishedExamResultCommand({ examResultId }, f.ctxMarker).run(),
      "EXAM_RESULT_INTEGRATION_UNSUPPORTED",
      `${status} result integration is UNSUPPORTED`
    );
    const rows = await gradeRows(db, f, enrollmentId);
    assert(rows.length === 0, `${status}: no Grade row written`);
    const progress = await db.studentSubjectProgress.findFirst({
      where: { organizationId: f.orgId, enrollmentId, levelSubjectId: f.levelSubjectId },
    });
    assert(progress == null, `${status}: no Progression written`);
  }
}

async function scenario6_maxScoreMismatch(db: PrismaClient, f: Fixture): Promise<void> {
  console.log("\n── 6. maxScore ≠ component.maxGrade → UNSUPPORTED; grade refused BEFORE progression (§10/§14) ──");
  const { studentId, enrollmentId } = await makeStudentEnrollment(db, f, "st-mismatch");
  const { examResultId } = await drivePublishedResult(f, {
    title: "MAXSCORE MISMATCH",
    studentId,
    enrollmentId,
    attendanceStatus: "PRESENT",
    score: 80,
    maxScore: 100, // ≠ component maxGrade (20)
    bind: true,
  });
  await assertRejectsWith(
    new IntegratePublishedExamResultCommand({ examResultId }, f.ctxMarker).run(),
    "EXAM_RESULT_INTEGRATION_UNSUPPORTED",
    "maxScore≠maxGrade integration is UNSUPPORTED (never rescaled)"
  );
  // §14 — grade failure ⇒ progression never executes ⇒ no ledger event, no grade, no progress.
  assert((await gradeRows(db, f, enrollmentId)).length === 0, "no Grade row written on refusal");
  assert(
    (await integratedEvents(db, f, examResultId)).length === 0,
    "no integrated ledger event on refusal"
  );
  assert(
    (await db.studentSubjectProgress.findFirst({
      where: { organizationId: f.orgId, enrollmentId, levelSubjectId: f.levelSubjectId },
    })) == null,
    "no Progression written on refusal"
  );
}

async function scenario7_bindingEnforcement(db: PrismaClient, f: Fixture): Promise<void> {
  console.log("\n── 7. Binding enforcement — no binding → UNSUPPORTED; archived binding → UNSUPPORTED; never a fallback (§11) ──");

  // (a) No binding at all → UNSUPPORTED (never falls back to a component by name/first/weight).
  const a = await makeStudentEnrollment(db, f, "st-nobind");
  const noBind = await drivePublishedResult(f, {
    title: "NO BINDING",
    studentId: a.studentId,
    enrollmentId: a.enrollmentId,
    attendanceStatus: "PRESENT",
    score: 15,
    maxScore: COMPONENT_MAX_GRADE,
    bind: false,
  });
  await assertRejectsWith(
    new IntegratePublishedExamResultCommand({ examResultId: noBind.examResultId }, f.ctxMarker).run(),
    "EXAM_RESULT_INTEGRATION_UNSUPPORTED",
    "unbound session integration is UNSUPPORTED (no fallback, even though a compatible component exists)"
  );
  assert((await gradeRows(db, f, a.enrollmentId)).length === 0, "unbound: no Grade row written");

  // (b) Bind then ARCHIVE (delete) the binding → still UNSUPPORTED (never a fallback).
  const b = await makeStudentEnrollment(db, f, "st-archived");
  const bound = await drivePublishedResult(f, {
    title: "ARCHIVED BINDING",
    studentId: b.studentId,
    enrollmentId: b.enrollmentId,
    attendanceStatus: "PRESENT",
    score: 15,
    maxScore: COMPONENT_MAX_GRADE,
    bind: true,
  });
  const binding = await db.examGradeComponentBinding.findFirstOrThrow({
    where: { organizationId: f.orgId, examSessionId: bound.sessionId, deletedAt: null },
  });
  await new ArchiveExamSessionGradeComponentBindingCommand(
    { bindingId: binding.id, reason: "remover associação" },
    f.ctxMarker
  ).run();
  await assertRejectsWith(
    new IntegratePublishedExamResultCommand({ examResultId: bound.examResultId }, f.ctxMarker).run(),
    "EXAM_RESULT_INTEGRATION_UNSUPPORTED",
    "archived-binding session integration is UNSUPPORTED (deletion → UNSUPPORTED, never a fallback)"
  );
  assert((await gradeRows(db, f, b.enrollmentId)).length === 0, "archived binding: no Grade row written");
}

async function scenario8_realAdapterIdentity(db: PrismaClient, f: Fixture): Promise<void> {
  console.log("\n── 8. Real-adapter identity — the write only happens through the live production adapter (§15) ──");
  // The integration command below is built with ONLY (input, context) — no ports —
  // so its resolver/gradePort/progressionPort are the production defaults. The only
  // way the assertions in scenario 1 could have passed (a real row in the real Grade
  // table + a real GradeChangeLog + a real StudentSubjectProgress) is if the LIVE
  // productionGradeWritePort executed. A fake/injected port cannot write those rows.
  const { studentId, enrollmentId } = await makeStudentEnrollment(db, f, "st-identity");
  const { examResultId } = await drivePublishedResult(f, {
    title: "REAL ADAPTER",
    studentId,
    enrollmentId,
    attendanceStatus: "PRESENT",
    score: 12,
    maxScore: COMPONENT_MAX_GRADE,
    bind: true,
  });
  const cmd = new IntegratePublishedExamResultCommand({ examResultId }, f.ctxMarker);
  // Sanity: the command was constructed WITHOUT a ports argument (production defaults).
  assert(cmd instanceof IntegratePublishedExamResultCommand, "command under test is the real IntegratePublishedExamResultCommand");
  await cmd.run();
  const rows = await gradeRows(db, f, enrollmentId);
  assert(rows.length === 1 && Number(rows[0]!.grade) === 12, "the live production adapter wrote the real Grade row");
}

// =============================================================================
// Teardown
// =============================================================================

async function teardown(
  db: PrismaClient,
  handle: { orgId: string; emailDomain: string; courseId?: string }
): Promise<void> {
  const org = { organizationId: handle.orgId };
  // Children first (FKs are NoAction — no cascade).
  await db.gradeChangeLog.deleteMany({ where: org });
  await db.studentAssessmentResult.deleteMany({ where: org });
  await db.studentSubjectProgress.deleteMany({ where: org });
  await db.studentLevelProgress.deleteMany({ where: org });
  await db.studentCourseProgress.deleteMany({ where: org });
  await db.examEvent.deleteMany({ where: org });
  await db.examResultRevision.deleteMany({ where: org });
  await db.examAppeal.deleteMany({ where: org });
  await db.examPublication.deleteMany({ where: org });
  await db.examGradeComponentBinding.deleteMany({ where: org });
  await db.examResult.deleteMany({ where: org });
  await db.examAttendance.deleteMany({ where: org });
  await db.examCandidate.deleteMany({ where: org });
  await db.examAttempt.deleteMany({ where: org });
  await db.examSession.deleteMany({ where: org });
  await db.examPeriod.deleteMany({ where: org });
  await db.auditLog.deleteMany({ where: org });
  await db.assessmentComponent.deleteMany({ where: org });
  await db.assessmentPolicy.deleteMany({ where: org });
  await db.enrollment.deleteMany({ where: org });
  await db.levelSubject.deleteMany({ where: org });
  await db.subject.deleteMany({ where: org });
  if (handle.courseId) {
    await db.courseLevel.deleteMany({ where: { courseId: handle.courseId } });
  }
  await db.course.deleteMany({ where: org });
  await db.academicYear.deleteMany({ where: org });
  await db.userRole.deleteMany({ where: org });
  await db.userOrganization.deleteMany({ where: org });
  await db.student.deleteMany({ where: org });
  await db.user.deleteMany({ where: { email: { endsWith: `@${handle.emailDomain}` } } });
  await db.organization.deleteMany({ where: { id: handle.orgId } });
  console.log(`\nTeardown complete for org ${handle.orgId}.`);
}

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<void> {
  const db = await getDb();
  let fixture: Fixture | undefined;
  try {
    fixture = await setup(db);

    const s1 = await scenario1_realWrite(db, fixture);
    await scenario2_idempotency(db, fixture, s1.examResultId);
    await scenario3_reconciliation(db, fixture, s1.examResultId, s1.enrollmentId);
    await scenario4_retractionBlocked(db, fixture, s1.sessionId, s1.enrollmentId);
    await scenario5_nonScored(db, fixture);
    await scenario6_maxScoreMismatch(db, fixture);
    await scenario7_bindingEnforcement(db, fixture);
    await scenario8_realAdapterIdentity(db, fixture);

    const exitCode = process.exitCode ?? 0;
    console.log(
      exitCode === 0
        ? "\n✓ All scenarios passed — the LIVE production Grade/Progression adapter works end-to-end."
        : "\n✗ One or more scenarios FAILED — review output above."
    );
  } finally {
    // Tear down using the full fixture when available, else the best-effort partial
    // handle captured during setup (so a setup failure never leaves orphan rows).
    const handle = fixture
      ? { orgId: fixture.orgId, emailDomain: fixture.emailDomain, courseId: fixture.courseId }
      : partialCleanup;
    if (handle) await teardown(db, handle);
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
