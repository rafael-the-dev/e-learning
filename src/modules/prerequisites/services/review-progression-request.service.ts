// NOTE: This is a service module (plain server-side code), NOT a server-actions module.
// It must NOT carry a "use server" directive: a "use server" module may export ONLY async
// functions, but this file also exports `ProgressionRequestError` (a class) and result
// interfaces. The illegal non-async export made Turbopack drop the whole module ("no exports
// at all"), breaking `next build` (BUG-PREREQ-001). The server-action entrypoints live in
// `actions/prerequisite.actions.ts` ("use server"), which call these functions.
import { getDb } from "@/server/db";
import {
  decideCourseCompletion,
  persistCourseCompletion,
  emitCourseCompletionSideEffects,
  type PersistCourseCompletionResult,
} from "@/modules/prerequisites/engines/course-completion.engine";
import { STUDENT_LEVEL_PROGRESS_STATUS } from "@/modules/prerequisites/types";
import { resolveStableCompletedAt } from "@/shared/lib/completed-at";
import {
  LEVEL_TERMINAL_STATUSES,
  LEVEL_COMPLETION_STATUSES,
} from "@/modules/prerequisites/services/recalculate-level-progress.service";

// =============================================================================
// REVIEW PROGRESSION REQUEST — TRANSACTIONAL APPROVAL / REJECTION
//
// Turns a PENDING LevelProgressionRequest into a committed academic decision.
// The whole mutation runs inside a single interactive transaction so a partial
// failure never leaves the enrollment promoted without its progress records
// updated (or vice-versa). No NEW academic calculation rules are introduced:
// the PROMOTED vs PROMOTED_WITH_PENDING_SUBJECTS split mirrors the level
// progression engine, and course completion reuses `decideCourseCompletion`.
// =============================================================================

export class ProgressionRequestError extends Error {}

type Tx = Parameters<Parameters<Awaited<ReturnType<typeof getDb>>["$transaction"]>[0]>[0];

export interface ApproveProgressionResult {
  enrollmentId: string;
  studentId: string;
  courseId: string;
  policyId: string | null;
  fromLevelId: string;
  toLevelId: string;
  /** PROMOTED or PROMOTED_WITH_PENDING_SUBJECTS. */
  fromLevelStatus: string;
}

export interface RejectProgressionResult {
  enrollmentId: string;
  studentId: string;
  courseId: string;
  policyId: string | null;
  fromLevelId: string;
  toLevelId: string;
}

// ─── Level status recompute (fromLevel), tx-scoped ────────────────────────────
// Same status semantics the recalculation service already uses: all required
// subjects passed and none pending → PROMOTED, otherwise the student advances
// carrying pending/failed subjects (PROMOTED_WITH_PENDING_SUBJECTS).
async function computeFromLevelPromotion(
  tx: Tx,
  organizationId: string,
  enrollmentId: string,
  fromLevelId: string
): Promise<{ status: string; earnedCredits: number }> {
  const levelSubjects = await tx.levelSubject.findMany({
    where: { courseLevelId: fromLevelId, organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, isRequired: true, credits: true },
  });
  const subjectProgress = await tx.studentSubjectProgress.findMany({
    where: {
      enrollmentId,
      organizationId,
      levelSubjectId: { in: levelSubjects.map((ls) => ls.id) },
    },
    select: { levelSubjectId: true, status: true },
  });
  const progressMap = new Map(subjectProgress.map((p) => [p.levelSubjectId, p.status]));

  let earnedCredits = 0;
  let failedRequired = 0;
  let pending = 0;
  for (const ls of levelSubjects) {
    const status = progressMap.get(ls.id) ?? "NOT_STARTED";
    if (status === "PASSED") earnedCredits += ls.credits ?? 0;
    else if (status === "FAILED") {
      if (ls.isRequired) failedRequired++;
    } else pending++;
  }

  const allPassed = failedRequired === 0 && pending === 0;
  return {
    status: allPassed
      ? STUDENT_LEVEL_PROGRESS_STATUS.PROMOTED
      : STUDENT_LEVEL_PROGRESS_STATUS.PROMOTED_WITH_PENDING_SUBJECTS,
    earnedCredits,
  };
}

// ─── Course progress recompute, tx-scoped ─────────────────────────────────────
// Runs on the transaction client so the StudentCourseProgress row is committed
// atomically with the promotion. Uses the SAME decision + persistence helpers as
// evaluateCourseCompletion (single writer) so completedAt semantics and the
// completion signal never diverge. Returns the persistence result so the caller
// can emit audit/event side effects AFTER the transaction commits.
async function recalculateCourseProgressTx(
  tx: Tx,
  organizationId: string,
  enrollmentId: string,
  studentId: string,
  courseId: string
): Promise<PersistCourseCompletionResult> {
  const courseLevels = await tx.courseLevel.findMany({
    where: { courseId, status: "ACTIVE" },
    select: { id: true, order: true, totalHours: true },
    orderBy: { order: "asc" },
  });
  const levelProgress = await tx.studentLevelProgress.findMany({
    where: { enrollmentId, organizationId },
    select: { courseLevelId: true, finalGrade: true, earnedCredits: true, status: true },
  });

  const decision = decideCourseCompletion(
    courseLevels.map((l) => ({ id: l.id, order: l.order, weight: l.totalHours ?? null })),
    levelProgress.map((p) => ({
      courseLevelId: p.courseLevelId,
      finalGrade: p.finalGrade != null ? parseFloat(String(p.finalGrade)) : null,
      earnedCredits: p.earnedCredits,
      status: p.status,
    }))
  );

  return persistCourseCompletion(tx, {
    organizationId,
    enrollmentId,
    studentId,
    courseId,
    decision,
    now: new Date(),
  });
}

// ─── Approve ──────────────────────────────────────────────────────────────────

export async function approveProgressionRequest(params: {
  requestId: string;
  organizationId: string;
  actorId: string;
  reviewNotes?: string | null;
}): Promise<ApproveProgressionResult> {
  const { requestId, organizationId, actorId, reviewNotes } = params;
  const db = await getDb();

  const result = await db.$transaction(async (tx) => {
    const request = await tx.levelProgressionRequest.findFirst({
      where: { id: requestId, organizationId, decision: "PENDING" },
      select: {
        id: true,
        enrollmentId: true,
        studentId: true,
        courseId: true,
        policyId: true,
        fromLevelId: true,
        toLevelId: true,
      },
    });
    if (!request) {
      throw new ProgressionRequestError("Pedido não encontrado ou já processado");
    }

    // Enrollment must still be progressable. A cancelled/completed enrollment
    // must never be promoted through a stale pending request.
    const enrollment = await tx.enrollment.findFirst({
      where: { id: request.enrollmentId, organizationId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!enrollment) {
      throw new ProgressionRequestError("Matrícula não encontrada");
    }
    if (enrollment.status === "CANCELLED" || enrollment.status === "COMPLETED") {
      throw new ProgressionRequestError(
        "A matrícula não está ativa — não é possível promover o aluno"
      );
    }

    // 1. Mark the request approved.
    await tx.levelProgressionRequest.update({
      where: { id: request.id },
      data: {
        decision: "APPROVED",
        reviewNotes: reviewNotes ?? null,
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });

    // 2. Advance the enrollment to the target level.
    await tx.enrollment.update({
      where: { id: request.enrollmentId },
      data: { currentLevelId: request.toLevelId },
    });

    // 3. Record the origin level's promotion status.
    const { status: fromLevelStatus, earnedCredits } = await computeFromLevelPromotion(
      tx,
      organizationId,
      request.enrollmentId,
      request.fromLevelId
    );
    const now = new Date();
    const existing = await tx.studentLevelProgress.findUnique({
      where: {
        enrollmentId_courseLevelId: {
          enrollmentId: request.enrollmentId,
          courseLevelId: request.fromLevelId,
        },
      },
      select: { finalGrade: true, earnedCredits: true, status: true, completedAt: true },
    });
    // Same stable-completedAt rule as the recalculation path: PROMOTED is a
    // positive completion (stamp now / preserve), but PROMOTED_WITH_PENDING_SUBJECTS
    // is NOT academically complete and carries no completedAt.
    const completedAt = resolveStableCompletedAt({
      previousStatus: existing?.status ?? null,
      previousCompletedAt: existing?.completedAt ?? null,
      nextStatus: fromLevelStatus,
      terminalStatuses: LEVEL_TERMINAL_STATUSES,
      completionStatuses: LEVEL_COMPLETION_STATUSES,
      now,
    });
    await tx.studentLevelProgress.upsert({
      where: {
        enrollmentId_courseLevelId: {
          enrollmentId: request.enrollmentId,
          courseLevelId: request.fromLevelId,
        },
      },
      create: {
        organizationId,
        enrollmentId: request.enrollmentId,
        studentId: request.studentId,
        courseId: request.courseId,
        courseLevelId: request.fromLevelId,
        finalGrade: null,
        earnedCredits,
        status: fromLevelStatus,
        progressReason: "Progressão aprovada manualmente",
        completedAt,
        calculatedAt: now,
      },
      update: {
        status: fromLevelStatus,
        // Preserve any grade/credits already computed by the grade engine.
        earnedCredits: existing?.earnedCredits ?? earnedCredits,
        progressReason: "Progressão aprovada manualmente",
        completedAt,
        calculatedAt: now,
      },
    });

    // 4. Cascade to course progress (atomic with the promotion).
    const courseCompletion = await recalculateCourseProgressTx(
      tx,
      organizationId,
      request.enrollmentId,
      request.studentId,
      request.courseId
    );

    return {
      enrollmentId: request.enrollmentId,
      studentId: request.studentId,
      courseId: request.courseId,
      policyId: request.policyId,
      fromLevelId: request.fromLevelId,
      toLevelId: request.toLevelId,
      fromLevelStatus,
      courseCompletion,
    };
  });

  // Emit completion side effects AFTER the transaction commits (event-bus
  // contract). Fires on either boundary crossing (COMPLETED entered / left).
  const { courseCompletion, ...approval } = result;
  if (courseCompletion.transition) {
    await emitCourseCompletionSideEffects({
      organizationId,
      actorId,
      progress: courseCompletion.progress,
      previousStatus: courseCompletion.previousStatus,
      transition: courseCompletion.transition,
      completionReason: courseCompletion.completionReason,
    });
  }

  return approval;
}

// ─── Reject ─────────────────────────────────────────────────────────────────

export async function rejectProgressionRequest(params: {
  requestId: string;
  organizationId: string;
  actorId: string;
  reason: string;
}): Promise<RejectProgressionResult> {
  const { requestId, organizationId, actorId, reason } = params;
  const db = await getDb();

  return db.$transaction(async (tx) => {
    const request = await tx.levelProgressionRequest.findFirst({
      where: { id: requestId, organizationId, decision: "PENDING" },
      select: {
        id: true,
        enrollmentId: true,
        studentId: true,
        courseId: true,
        policyId: true,
        fromLevelId: true,
        toLevelId: true,
      },
    });
    if (!request) {
      throw new ProgressionRequestError("Pedido não encontrado ou já processado");
    }

    // Rejection records the reviewer's reason and reviewer identity. The
    // enrollment's currentLevelId is deliberately left UNCHANGED.
    await tx.levelProgressionRequest.update({
      where: { id: request.id },
      data: {
        decision: "REJECTED",
        reason,
        reviewNotes: reason,
        reviewedAt: new Date(),
        reviewedBy: actorId,
      },
    });

    return {
      enrollmentId: request.enrollmentId,
      studentId: request.studentId,
      courseId: request.courseId,
      policyId: request.policyId,
      fromLevelId: request.fromLevelId,
      toLevelId: request.toLevelId,
    };
  });
}
