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
import type { PrismaClientOrTx } from "@/server/db";
import type { DomainEvent } from "@/server/events/domain-event";
import { eventPublisher } from "@/server/events/event-publisher";

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
  /**
   * Transaction client. When provided, the GradeChangeLog write and the whole
   * derived cascade run on it, committing atomically with the canonical grade.
   */
  client?: PrismaClientOrTx;
  /**
   * Domain-event collector. When provided, the cascade PUSHES events into it and
   * the caller (transaction owner) publishes them AFTER commit — so no event is
   * emitted for a rolled-back change. When omitted, events are published here.
   */
  events?: DomainEvent[];
}

export interface GradeMutationResult {
  progress: StudentSubjectProgress;
  /** Events produced by the cascade (already published unless a collector was passed in). */
  events: DomainEvent[];
}

export class GradeMutationService {
  /**
   * Record the change (GradeChangeLog) and cascade progression. All writes use
   * `params.client` when supplied so they commit atomically with the caller's
   * transaction. Domain events are collected and returned; if the caller did not
   * supply its own `events` collector, they are published here (legacy path).
   */
  async handleGradeMutation(
    context: AuthContext,
    params: HandleGradeMutationParams
  ): Promise<GradeMutationResult> {
    const { result, previous, source, reason, client } = params;
    const shouldLog = params.logChange ?? true;

    // If the caller owns the event lifecycle (passed a collector) it publishes
    // after commit; otherwise we publish here once the cascade returns.
    const callerOwnsEvents = params.events != null;
    const events: DomainEvent[] = params.events ?? [];

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
      }, client);
    }

    const cascadeParams: RecalculateSubjectProgressParams = {
      studentId: result.studentId,
      enrollmentId: result.enrollmentId,
      levelSubjectId: result.levelSubjectId,
      auditAction: params.auditAction,
    };

    const progress = await recalculateSubjectProgressCascade(context, cascadeParams, {
      client,
      events,
    });

    // Legacy standalone path (no external transaction/collector): publish now.
    if (!callerOwnsEvents) {
      for (const event of events) {
        await eventPublisher.publish(event);
      }
    }

    return { progress, events };
  }
}

export const gradeMutationService = new GradeMutationService();
