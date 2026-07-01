// =============================================================================
// GRADE MUTATION SERVICE
// The single orchestration path for every canonical grade mutation:
//
//   GradeMutated
//     -> GradeChangeLog   (immutable audit of the value/status change)
//     -> recalculateSubjectProgressCascade
//          -> StudentSubjectProgress -> StudentLevelProgress -> StudentCourseProgress
//
// Every write path (create / update / cancel / invalidate / recovery / bulk)
// funnels through here so grades stay auditable and progression stays derived
// from the single source of truth (StudentAssessmentResult). Authorization is
// the responsibility of the calling command; this service performs no checks.
// =============================================================================

import type { AuthContext } from "@/server/auth/context";
import { createGradeChangeLog } from "@/modules/grades/repositories/grade-change-log.repository";
import {
  recalculateSubjectProgressCascade,
  type RecalculateSubjectProgressParams,
} from "@/modules/grades/services/subject-progress-cascade.service";
import type { StudentAssessmentResult, GradeChangeSource } from "@/modules/grades/types";
import type { StudentSubjectProgress } from "@/modules/assessments/types";

export interface GradeSnapshot {
  grade: number;
  normalizedGrade: number;
  status: string;
}

export interface HandleGradeMutationParams {
  /** Canonical result AFTER the write. */
  result: StudentAssessmentResult;
  /** State BEFORE the write, or null for an initial creation. */
  previous: GradeSnapshot | null;
  /** Origin of the mutation, recorded on the change log. */
  source: GradeChangeSource;
  /** Human reason. Required for post-submission edits by the command layer. */
  reason: string;
  /** Audit action for the cascade step; defaults per cascade service. */
  auditAction?: string;
  /**
   * When false, skips writing a GradeChangeLog (e.g. nothing actually changed).
   * Defaults to true.
   */
  logChange?: boolean;
}

export class GradeMutationService {
  /**
   * Record the change and cascade progression. Returns the recalculated
   * subject progress so callers can surface it if needed.
   */
  async handleGradeMutation(
    context: AuthContext,
    params: HandleGradeMutationParams
  ): Promise<StudentSubjectProgress> {
    const { result, previous, source, reason } = params;
    const shouldLog = params.logChange ?? true;

    if (shouldLog) {
      await createGradeChangeLog({
        organizationId: result.organizationId,
        studentAssessmentResultId: result.id,
        assessmentEventId: result.assessmentEventId ?? null,
        oldGrade: previous?.grade ?? null,
        newGrade: result.grade,
        oldNormalizedGrade: previous?.normalizedGrade ?? null,
        newNormalizedGrade: result.normalizedGrade,
        oldStatus: previous?.status ?? null,
        newStatus: result.status,
        source,
        reason,
        changedBy: context.userId,
      });
    }

    const cascadeParams: RecalculateSubjectProgressParams = {
      studentId: result.studentId,
      enrollmentId: result.enrollmentId,
      levelSubjectId: result.levelSubjectId,
      auditAction: params.auditAction,
    };

    return recalculateSubjectProgressCascade(context, cascadeParams);
  }
}

export const gradeMutationService = new GradeMutationService();
