import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findDistinctSummaryTargets } from "@/modules/attendance/repositories/student-subject-attendance-summary.repository";
import { recalculateStudentSubjectAttendanceSummary } from "@/modules/attendance/services/student-subject-attendance-summary.service";

// =============================================================================
// RecalculateAttendanceSummariesCommand — Attendance Engine Phase 3 (batch)
//
// Repair/backfill sweep: recompute every (enrollment, levelSubject) that has
// attendance records within the given scope. Each target is recomputed in its own
// transaction (single-writer service); one failure never aborts the sweep.
// Behaviour-neutral (summary read-model only).
// =============================================================================

export interface RecalcSummariesBatchInput {
  classGroupId?: string;
  levelSubjectId?: string;
  enrollmentId?: string;
}

export interface RecalcSummariesBatchResult {
  targets: number;
  changed: number;
  failed: number;
}

export class RecalculateAttendanceSummariesCommand extends BaseCommand<
  RecalcSummariesBatchInput,
  RecalcSummariesBatchResult
> {
  async validate(): Promise<void> {
    // Require at least one scope filter — refuse an unbounded org-wide sweep by accident.
    if (!this.input.classGroupId && !this.input.levelSubjectId && !this.input.enrollmentId) {
      throw new ValidationError("Dados inválidos", {
        scope: ["Indique pelo menos um filtro: turma, disciplina ou matrícula."],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SUMMARIES_RECALCULATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<RecalcSummariesBatchResult> {
    const targets = await findDistinctSummaryTargets(this.context.organizationId, {
      classGroupId: this.input.classGroupId,
      levelSubjectId: this.input.levelSubjectId,
      enrollmentId: this.input.enrollmentId,
    });

    let changed = 0;
    let failed = 0;
    for (const t of targets) {
      try {
        const result = await recalculateStudentSubjectAttendanceSummary(this.context, {
          enrollmentId: t.enrollmentId,
          levelSubjectId: t.levelSubjectId,
        });
        if (result.changed) changed++;
      } catch {
        failed++;
      }
    }

    await auditService.log(this.context, {
      entity: "StudentSubjectAttendanceSummary",
      entityId: this.context.organizationId,
      action: "attendance_summary.batch_recalculated",
      newValues: {
        scope: {
          classGroupId: this.input.classGroupId ?? null,
          levelSubjectId: this.input.levelSubjectId ?? null,
          enrollmentId: this.input.enrollmentId ?? null,
        },
        targets: targets.length,
        changed,
        failed,
      },
    });

    return { targets: targets.length, changed, failed };
  }
}
