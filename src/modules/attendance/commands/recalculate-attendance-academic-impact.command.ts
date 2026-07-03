import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findDistinctSummaryTargets } from "@/modules/attendance/repositories/student-subject-attendance-summary.repository";
import { recalculateStudentSubjectAttendanceSummary } from "@/modules/attendance/services/student-subject-attendance-summary.service";
import { applyAttendanceAcademicImpact } from "@/modules/attendance/services/attendance-academic-wiring.service";

// =============================================================================
// RecalculateAttendanceAcademicImpactCommand — Attendance Engine Phase 5 (repair)
//
// Operator repair/backfill for the GATED attendance→academic wiring. For each
// target (enrollment, levelSubject):
//   • real run  — recompute the summary, then apply the academic impact
//                 (which itself gates on enforcement + clears stale impact).
//   • dryRun    — preview the academic impact of the CURRENT summary; no writes.
//
// Idempotent, tenant-scoped, admin-only. It NEVER changes academics unless the
// effective policy enables enforcement (the wiring service enforces the gate).
// =============================================================================

export interface RecalcAcademicImpactInput {
  enrollmentId?: string;
  levelSubjectId?: string;
  academicYearId?: string;
  classGroupId?: string;
  dryRun?: boolean;
}

export interface RecalcAcademicImpactResult {
  targets: number;
  changed: number;
  markedIncomplete: number;
  recoveredFromIncomplete: number;
  failed: number;
  dryRun: boolean;
}

export class RecalculateAttendanceAcademicImpactCommand extends BaseCommand<
  RecalcAcademicImpactInput,
  RecalcAcademicImpactResult
> {
  async validate(): Promise<void> {
    // At least one scoping filter is required to avoid an unbounded org-wide sweep
    // by accident.
    const { enrollmentId, levelSubjectId, academicYearId, classGroupId } = this.input;
    if (!enrollmentId && !levelSubjectId && !academicYearId && !classGroupId) {
      throw new ValidationError("Dados inválidos", {
        scope: ["Indique pelo menos um filtro (matrícula, disciplina, ano lectivo ou turma)."],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SUMMARIES_RECALCULATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<RecalcAcademicImpactResult> {
    const dryRun = this.input.dryRun ?? false;

    const targets =
      this.input.enrollmentId && this.input.levelSubjectId
        ? [{ enrollmentId: this.input.enrollmentId, levelSubjectId: this.input.levelSubjectId }]
        : await findDistinctSummaryTargets(this.context.organizationId, {
            enrollmentId: this.input.enrollmentId,
            levelSubjectId: this.input.levelSubjectId,
            classGroupId: this.input.classGroupId,
            academicYearId: this.input.academicYearId,
          });

    let changed = 0;
    let markedIncomplete = 0;
    let recoveredFromIncomplete = 0;
    let failed = 0;

    for (const t of targets) {
      try {
        if (!dryRun) {
          // Refresh the summary first (no wiring here — we drive it explicitly next
          // so the repair also fires when the summary itself is unchanged).
          await recalculateStudentSubjectAttendanceSummary(
            this.context,
            { enrollmentId: t.enrollmentId, levelSubjectId: t.levelSubjectId },
            { applyAcademicImpact: false }
          );
        }
        const impact = await applyAttendanceAcademicImpact(
          this.context,
          { enrollmentId: t.enrollmentId, levelSubjectId: t.levelSubjectId },
          { dryRun }
        );
        if (impact.changed) changed++;
        if (impact.previousStatus !== "INCOMPLETE" && impact.newStatus === "INCOMPLETE") markedIncomplete++;
        if (impact.previousStatus === "INCOMPLETE" && impact.newStatus !== "INCOMPLETE") recoveredFromIncomplete++;
      } catch {
        failed++;
      }
    }

    if (!dryRun) {
      await auditService.log(this.context, {
        entity: "StudentSubjectProgress",
        entityId: this.context.organizationId,
        action: "student_subject_progress.attendance_impact_batch",
        newValues: {
          scope: {
            enrollmentId: this.input.enrollmentId ?? null,
            levelSubjectId: this.input.levelSubjectId ?? null,
            academicYearId: this.input.academicYearId ?? null,
            classGroupId: this.input.classGroupId ?? null,
          },
          targets: targets.length,
          changed,
          markedIncomplete,
          recoveredFromIncomplete,
          failed,
        },
      });
    }

    return { targets: targets.length, changed, markedIncomplete, recoveredFromIncomplete, failed, dryRun };
  }
}
