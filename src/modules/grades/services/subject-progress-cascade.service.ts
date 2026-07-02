// =============================================================================
// SUBJECT PROGRESS CASCADE SERVICE
// The single, canonical recalculation path for academic progression.
//
//   StudentAssessmentResult (source of truth)
//        -> StudentSubjectProgress
//        -> StudentLevelProgress   (recalculateStudentLevelProgress)
//        -> StudentCourseProgress  (evaluateCourseCompletion, cascaded inside)
//
// Every grade mutation funnels through here so subject -> level -> course
// progress can never diverge from the canonical grades. Authorization is the
// responsibility of the caller (command layer); this service performs no
// permission checks and always cascades.
// =============================================================================

import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import { findResultsByEnrollmentAndLevelSubject } from "@/modules/grades/repositories/student-assessment-result.repository";
import { upsertStudentSubjectProgress } from "@/modules/assessments/repositories/student-subject-progress.repository";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import {
  gradeCalculationService,
  type GradeComponentScore,
} from "@/modules/grades/services/grade-calculation.service";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import { recalculateStudentLevelProgress } from "@/modules/prerequisites/services/recalculate-level-progress.service";

export interface RecalculateSubjectProgressParams {
  studentId: string;
  enrollmentId: string;
  levelSubjectId: string;
  /** Audit action to record; callers use their own verb. */
  auditAction?: string;
}

/**
 * Recalculate StudentSubjectProgress from the canonical StudentAssessmentResult
 * rows and cascade to level and course progress. Always cascades. No auth.
 */
export async function recalculateSubjectProgressCascade(
  context: AuthContext,
  params: RecalculateSubjectProgressParams
): Promise<StudentSubjectProgress> {
  const { organizationId } = context;
  const { studentId, enrollmentId, levelSubjectId } = params;

  const db = await getDb();
  const levelSubject = await db.levelSubject.findFirst({
    where: { id: levelSubjectId, organizationId },
    select: { minimumPassingGrade: true, minimumAttendancePercentage: true, courseLevelId: true },
  });

  const policy = await findActivePolicyForLevelSubject(levelSubjectId, organizationId);
  const components = policy
    ? await findActiveComponentsByPolicy(policy.id, organizationId)
    : [];

  // Read from unified StudentAssessmentResult (single source of truth).
  // CANCELLED / invalidated results are excluded by the repository query,
  // so an invalidated grade correctly drops out of the calculation.
  const results = await findResultsByEnrollmentAndLevelSubject(
    enrollmentId,
    levelSubjectId,
    organizationId
  );

  const componentScores: GradeComponentScore[] = components.map((comp) => {
    const matching = results.find((r) => r.assessmentComponentId === comp.id);
    return {
      componentId: comp.id,
      weight: comp.weight,
      maxGrade: comp.maxGrade,
      grade: matching?.grade ?? null,
      normalizedGrade: matching?.normalizedGrade ?? null,
      isRequired: comp.isRequired,
    };
  });

  const minPassingGrade =
    levelSubject?.minimumPassingGrade != null
      ? Number(levelSubject.minimumPassingGrade)
      : policy?.minimumPassingGrade ?? 50;

  const minAttendance = levelSubject?.minimumAttendancePercentage
    ? Number(levelSubject.minimumAttendancePercentage)
    : null;

  // ATTENDANCE GATING IS INTENTIONALLY INACTIVE (Grade Engine Final Sprint).
  // The Attendance Engine is out of scope for this sprint, so there is no
  // canonical per-enrollment attendance percentage to feed in yet. We pass
  // attendancePercentage: null so the INCOMPLETE (frequência abaixo do mínimo)
  // branch in GradeCalculationService stays dormant — a subject can pass on
  // grade alone. minimumAttendancePercentage is still read and forwarded so the
  // gate activates automatically once the Attendance Engine supplies a real
  // percentage here. Do NOT fabricate an attendance value to force the branch.
  let calculationResult;
  if (policy && components.length > 0) {
    calculationResult = gradeCalculationService.calculateFinalGrade({
      calculationMethod: policy.calculationMethod,
      roundingMethod: policy.roundingMethod,
      minimumPassingGrade: minPassingGrade,
      allowRecovery: policy.allowRecovery,
      components: componentScores,
      attendancePercentage: null, // inactive until Attendance Engine — see note above
      minimumAttendancePercentage: minAttendance,
    });
  } else {
    calculationResult = {
      finalGrade: null,
      status: "IN_PROGRESS" as const,
      reason: "Sem política de avaliação configurada",
    };
  }

  const progressStatus =
    calculationResult.status === "PASSED" ? "PASSED" :
    calculationResult.status === "FAILED" ? "FAILED" :
    calculationResult.status === "RECOVERY_REQUIRED" ? "FAILED" :
    calculationResult.status === "INCOMPLETE" ? "INCOMPLETE" :
    calculationResult.status === "BLOCKED" ? "BLOCKED" :
    "IN_PROGRESS";

  const isTerminal = progressStatus === "PASSED" || progressStatus === "FAILED";

  const progress = await upsertStudentSubjectProgress({
    organizationId,
    studentId,
    enrollmentId,
    levelSubjectId,
    finalGrade: calculationResult.finalGrade,
    attendancePercentage: null, // inactive until the Attendance Engine lands (see note above)
    status: progressStatus,
    progressReason: calculationResult.reason,
    completedAt: isTerminal ? new Date() : null,
  });

  await auditService.log(context, {
    entity: "StudentSubjectProgress",
    entityId: progress.id,
    action: params.auditAction ?? "student_subject_progress.updated",
    newValues: {
      studentId,
      levelSubjectId,
      finalGrade: progress.finalGrade,
      status: progress.status,
    },
  });

  // Cascade: subject progress -> level progress -> course progress
  if (levelSubject?.courseLevelId) {
    await recalculateStudentLevelProgress(enrollmentId, levelSubject.courseLevelId, organizationId);
  }

  if (progressStatus === "PASSED") {
    await eventPublisher.publish({
      organizationId,
      eventType: DomainEventType.STUDENT_SUBJECT_PASSED,
      aggregateType: DomainAggregateType.STUDENT,
      aggregateId: studentId,
      actorId: context.userId,
      payload: { studentId, enrollmentId, levelSubjectId, finalGrade: progress.finalGrade, progressId: progress.id },
    });
  } else if (progressStatus === "FAILED") {
    await eventPublisher.publish({
      organizationId,
      eventType: DomainEventType.STUDENT_SUBJECT_FAILED,
      aggregateType: DomainAggregateType.STUDENT,
      aggregateId: studentId,
      actorId: context.userId,
      payload: { studentId, enrollmentId, levelSubjectId, finalGrade: progress.finalGrade, progressId: progress.id },
    });
  }

  return progress;
}
