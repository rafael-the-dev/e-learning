import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findDistinctPeriodEnrollments } from "@/modules/attendance/repositories/student-period-attendance-summary.repository";
import { recalculateStudentPeriodAttendanceSummary } from "@/modules/attendance/services/student-period-attendance-summary.service";

// =============================================================================
// RecalculatePeriodAttendanceSummariesCommand — Attendance Engine Phase 4 (batch)
//
// Repair/backfill sweep for period summaries within an academic year (optionally
// a term / class group / course). One period per enrolment recomputed in its own
// transaction (single-writer service); one failure never aborts the sweep.
// Reporting-only / behaviour-neutral. Supports dryRun.
//
// Granularity: `academicTermId` provided → term summaries; omitted → the
// year-rollup summaries (academicTermId = null).
// =============================================================================

export interface RecalcPeriodBatchInput {
  academicYearId: string;
  academicTermId?: string | null;
  classGroupId?: string;
  courseId?: string;
  batchSize?: number;
  dryRun?: boolean;
}

export interface RecalcPeriodBatchResult {
  targets: number;
  changed: number;
  failed: number;
  dryRun: boolean;
}

export class RecalculatePeriodAttendanceSummariesCommand extends BaseCommand<
  RecalcPeriodBatchInput,
  RecalcPeriodBatchResult
> {
  async validate(): Promise<void> {
    if (!this.input.academicYearId) {
      throw new ValidationError("Dados inválidos", { academicYearId: ["Obrigatório."] });
    }
    if (
      this.input.batchSize != null &&
      (!Number.isInteger(this.input.batchSize) || this.input.batchSize < 1 || this.input.batchSize > 5000)
    ) {
      throw new ValidationError("Dados inválidos", {
        batchSize: ["O tamanho do lote deve ser um inteiro entre 1 e 5000."],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SUMMARIES_RECALCULATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<RecalcPeriodBatchResult> {
    const dryRun = this.input.dryRun ?? false;
    const academicTermId = this.input.academicTermId ?? null;

    const enrollmentIds = await findDistinctPeriodEnrollments(this.context.organizationId, {
      academicYearId: this.input.academicYearId,
      academicTermId: this.input.academicTermId ?? undefined,
      classGroupId: this.input.classGroupId,
      courseId: this.input.courseId,
    });

    let changed = 0;
    let failed = 0;
    for (const enrollmentId of enrollmentIds) {
      try {
        const result = await recalculateStudentPeriodAttendanceSummary(
          this.context,
          { enrollmentId, academicYearId: this.input.academicYearId, academicTermId },
          { dryRun }
        );
        if (result.changed) changed++;
      } catch {
        failed++;
      }
    }

    if (!dryRun) {
      await auditService.log(this.context, {
        entity: "StudentPeriodAttendanceSummary",
        entityId: this.context.organizationId,
        action: "attendance_period_summary.batch_recalculated",
        newValues: {
          scope: {
            academicYearId: this.input.academicYearId,
            academicTermId,
            classGroupId: this.input.classGroupId ?? null,
            courseId: this.input.courseId ?? null,
          },
          targets: enrollmentIds.length,
          changed,
          failed,
        },
      });
    }

    return { targets: enrollmentIds.length, changed, failed, dryRun };
  }
}
