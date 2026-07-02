import { getDb } from "@/server/db";
import { findLevelProgressByEnrollment } from "@/modules/prerequisites/repositories/student-level-progress.repository";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import type { StudentCourseProgress } from "@/modules/prerequisites/types";
import {
  getCourseCompletionStrategy,
  DEFAULT_COURSE_COMPLETION_POLICY,
  type CourseCompletionPolicy,
  type CourseCompletionDecision,
  type CourseCompletionReason,
  type CourseLevelInput,
  type CourseLevelProgressInput,
} from "@/modules/prerequisites/engines/course-completion.strategy";

// =============================================================================
// COURSE COMPLETION ENGINE
// Orchestrates the completion evaluation: it loads the inputs, delegates the
// DECISION to a CourseCompletionStrategy (see course-completion.strategy.ts),
// persists the result through the single canonical writer, logs the decision,
// and emits lifecycle events on status transitions.
//
// It derives StudentCourseProgress from the per-level StudentLevelProgress
// records ONLY. It never reads grades directly, never mutates grades, and never
// touches the Enrollment lifecycle (a separate, explicit CompleteEnrollmentCommand
// owns Enrollment.status).
//
// STUB — NOT ENFORCED HERE YET (documented, not silently ignored):
//   * Financial clearance is NOT checked here. Gate via a future
//     FinancialEligibilityService (CourseCompletionPolicy.requireFinancialClearance).
//   * Attendance clearance is NOT checked here. Gate via a future AttendanceEngine
//     (CourseCompletionPolicy.requireAttendance).
// Do not add partial/faked versions of either — wire the real services.
// =============================================================================

// Re-export the decision contract so existing importers keep their import site.
export type {
  CourseLevelInput,
  CourseLevelProgressInput,
  CourseCompletionDecision,
} from "@/modules/prerequisites/engines/course-completion.strategy";
export {
  COURSE_COMPLETION_STRATEGY,
  COURSE_COMPLETION_REASON,
  COURSE_FINAL_GRADE_MODE,
  DEFAULT_COURSE_COMPLETION_POLICY,
  computeCourseFinalGrade,
} from "@/modules/prerequisites/engines/course-completion.strategy";

/**
 * Pure completion decision. Thin facade over the configured strategy so existing
 * callers (and tests) keep a stable, IO-free entry point. Defaults to STANDARD.
 */
export function decideCourseCompletion(
  courseLevels: CourseLevelInput[],
  levelProgress: CourseLevelProgressInput[],
  policy: CourseCompletionPolicy = DEFAULT_COURSE_COMPLETION_POLICY
): CourseCompletionDecision {
  return getCourseCompletionStrategy(policy).decide({ courseLevels, levelProgress, policy });
}

// ─── Shared persistence path ───────────────────────────────────────────────────
// The SINGLE canonical writer for StudentCourseProgress. Both the async wrapper
// (evaluateCourseCompletion) and the transactional path (recalculateCourseProgressTx
// in review-progression-request.service) go through here so the completedAt
// semantics and the transition signal can never diverge.

type CourseProgressClient =
  | Awaited<ReturnType<typeof getDb>>
  | Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["$transaction"]>[0]>[0];

/** Status transition detected by a persist call (null when the status did not cross the COMPLETED boundary). */
export type CourseCompletionTransition = "COMPLETED" | "REOPENED";

export interface PersistCourseCompletionResult {
  progress: StudentCourseProgress;
  previousStatus: string | null;
  /** True only when this write moved the course from not-COMPLETED → COMPLETED. */
  transitionedToCompleted: boolean;
  /** COMPLETED (entered) / REOPENED (left) / null (no boundary crossing). */
  transition: CourseCompletionTransition | null;
  /** Derived reason carried through so side effects can report it (not persisted). */
  completionReason: CourseCompletionReason;
}

export async function persistCourseCompletion(
  client: CourseProgressClient,
  params: {
    organizationId: string;
    enrollmentId: string;
    studentId: string;
    courseId: string;
    decision: CourseCompletionDecision;
    now: Date;
  }
): Promise<PersistCourseCompletionResult> {
  const { organizationId, enrollmentId, studentId, courseId, decision, now } = params;

  const existing = await client.studentCourseProgress.findFirst({
    where: { enrollmentId, organizationId },
    select: { status: true, completedAt: true },
  });

  // completedAt semantics (stable across passive recalculations):
  //   not completed → completed : stamp `now`
  //   stays completed            : PRESERVE the original completedAt
  //   completed → not completed  : clear to null
  const completedAt = decision.completed ? existing?.completedAt ?? now : null;

  const row = await client.studentCourseProgress.upsert({
    where: { enrollmentId },
    create: {
      organizationId,
      enrollmentId,
      studentId,
      courseId,
      finalGrade: decision.finalGrade,
      earnedCredits: decision.earnedCredits,
      status: decision.status,
      progressReason: decision.progressReason,
      completedAt,
      calculatedAt: now,
    },
    update: {
      finalGrade: decision.finalGrade,
      earnedCredits: decision.earnedCredits,
      status: decision.status,
      progressReason: decision.progressReason,
      completedAt,
      calculatedAt: now,
    },
    include: { course: { select: { name: true } } },
  });

  const previousStatus = existing?.status ?? null;
  const enteredCompleted = decision.status === "COMPLETED" && previousStatus !== "COMPLETED";
  const leftCompleted = previousStatus === "COMPLETED" && decision.status !== "COMPLETED";

  return {
    progress: mapCourseProgressRow(row),
    previousStatus,
    transitionedToCompleted: enteredCompleted,
    transition: enteredCompleted ? "COMPLETED" : leftCompleted ? "REOPENED" : null,
    completionReason: decision.completionReason,
  };
}

function mapCourseProgressRow(row: {
  id: string;
  organizationId: string;
  enrollmentId: string;
  studentId: string;
  courseId: string;
  finalGrade: unknown;
  earnedCredits: number | null;
  status: string;
  progressReason: string | null;
  completedAt: Date | null;
  calculatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  course?: { name: string } | null;
}): StudentCourseProgress {
  return {
    id: row.id,
    organizationId: row.organizationId,
    enrollmentId: row.enrollmentId,
    studentId: row.studentId,
    courseId: row.courseId,
    finalGrade: row.finalGrade != null ? parseFloat(String(row.finalGrade)) : null,
    earnedCredits: row.earnedCredits,
    status: row.status,
    progressReason: row.progressReason,
    completedAt: row.completedAt,
    calculatedAt: row.calculatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    courseName: row.course?.name ?? null,
  };
}

// ─── Observability ──────────────────────────────────────────────────────────────
// Structured decision log. No business behaviour; consumed by log-based dashboards.
export function logCourseCompletionEvaluation(entry: {
  enrollmentId: string;
  courseId: string;
  previousStatus: string | null;
  newStatus: string;
  completionReason: CourseCompletionReason;
  transition: CourseCompletionTransition | null;
  durationMs: number;
  evaluatedLevels: number;
}): void {
  console.info("[course-completion] evaluated", JSON.stringify(entry));
}

// ─── Side effects (audit + domain event) ───────────────────────────────────────
// Emitted ONLY on a status boundary crossing (COMPLETED entered / left), so
// passive recalculations don't spam the audit log. MUST be called AFTER the
// owning DB transaction commits (the event bus contract requires it).

export async function emitCourseCompletionSideEffects(params: {
  organizationId: string;
  actorId?: string | null;
  progress: StudentCourseProgress;
  previousStatus: string | null;
  transition: CourseCompletionTransition;
  completionReason: CourseCompletionReason;
}): Promise<void> {
  const { organizationId, actorId, progress, previousStatus, transition, completionReason } = params;

  const isCompleted = transition === "COMPLETED";
  const action = isCompleted ? "course_completion.completed" : "course_completion.reopened";
  const eventType = isCompleted
    ? DomainEventType.STUDENT_COURSE_COMPLETED
    : DomainEventType.STUDENT_COURSE_REOPENED;

  const payload = {
    enrollmentId: progress.enrollmentId,
    studentId: progress.studentId,
    courseId: progress.courseId,
    previousStatus,
    newStatus: progress.status,
    completionReason,
    finalGrade: progress.finalGrade,
    completedAt: progress.completedAt,
  };

  const db = await getDb();
  // Written directly (not via auditService.log) so a system-driven cascade with
  // no acting user records actorId = null instead of a bogus user id.
  await db.auditLog.create({
    data: {
      organizationId,
      actorId: actorId ?? null,
      entity: "StudentCourseProgress",
      entityId: progress.id,
      action,
      newValues: JSON.stringify(payload),
    },
  });

  await eventPublisher.publish({
    organizationId,
    eventType,
    aggregateType: DomainAggregateType.STUDENT,
    aggregateId: progress.studentId,
    actorId: actorId ?? undefined,
    payload,
  });
}

// ─── IO wrapper ───────────────────────────────────────────────────────────────

export async function evaluateCourseCompletion(
  enrollmentId: string,
  organizationId: string,
  // Optional: the acting user when known (e.g. a manual recalculation). System
  // cascades (grade engine → level → course) leave this null.
  actorId?: string | null
): Promise<StudentCourseProgress> {
  const startedAt = Date.now();
  const db = await getDb();

  const enrollment = await db.enrollment.findFirst({
    where: { id: enrollmentId, organizationId, deletedAt: null },
    select: { studentId: true, courseId: true },
  });

  if (!enrollment) throw new Error("Matrícula não encontrada");

  const courseLevels = await db.courseLevel.findMany({
    where: { courseId: enrollment.courseId, status: "ACTIVE" },
    select: { id: true, order: true, totalHours: true },
    orderBy: { order: "asc" },
  });

  const levelProgress = await findLevelProgressByEnrollment(enrollmentId, organizationId);

  const decision = decideCourseCompletion(
    courseLevels.map((l) => ({ id: l.id, order: l.order, weight: l.totalHours ?? null })),
    levelProgress.map((p) => ({
      courseLevelId: p.courseLevelId,
      finalGrade: p.finalGrade,
      earnedCredits: p.earnedCredits,
      status: p.status,
    }))
  );

  const result = await persistCourseCompletion(db, {
    organizationId,
    enrollmentId,
    studentId: enrollment.studentId,
    courseId: enrollment.courseId,
    decision,
    now: new Date(),
  });

  logCourseCompletionEvaluation({
    enrollmentId,
    courseId: enrollment.courseId,
    previousStatus: result.previousStatus,
    newStatus: result.progress.status,
    completionReason: result.completionReason,
    transition: result.transition,
    durationMs: Date.now() - startedAt,
    evaluatedLevels: courseLevels.length,
  });

  if (result.transition) {
    await emitCourseCompletionSideEffects({
      organizationId,
      actorId,
      progress: result.progress,
      previousStatus: result.previousStatus,
      transition: result.transition,
      completionReason: result.completionReason,
    });
  }

  return result.progress;
}
