import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { recalculateStudentPeriodAttendanceSummary } from "@/modules/attendance/services/student-period-attendance-summary.service";
import type { PeriodSummaryRecalcResult } from "@/modules/attendance/types";

// =============================================================================
// RecalculateStudentPeriodAttendanceSummaryCommand — Attendance Engine Phase 4
//
// Explicit, RBAC-guarded, transactional recompute of ONE period summary
// (enrollment + academic year + optional term). Delegates to the single-writer
// service. Reporting-only / behaviour-neutral. Supports dryRun.
// =============================================================================

export interface RecalcPeriodInput {
  enrollmentId: string;
  academicYearId: string;
  academicTermId?: string | null;
  dryRun?: boolean;
}

export class RecalculateStudentPeriodAttendanceSummaryCommand extends BaseCommand<
  RecalcPeriodInput,
  PeriodSummaryRecalcResult
> {
  async validate(): Promise<void> {
    if (!this.input.enrollmentId || !this.input.academicYearId) {
      throw new ValidationError("Dados inválidos", {
        ...(!this.input.enrollmentId ? { enrollmentId: ["Obrigatório."] } : {}),
        ...(!this.input.academicYearId ? { academicYearId: ["Obrigatório."] } : {}),
      });
    }
    const db = await getDb();
    const enrollment = await db.enrollment.findFirst({
      where: { id: this.input.enrollmentId, organizationId: this.context.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!enrollment) throw new NotFoundError("Matrícula", this.input.enrollmentId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SUMMARIES_RECALCULATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<PeriodSummaryRecalcResult> {
    return recalculateStudentPeriodAttendanceSummary(
      this.context,
      {
        enrollmentId: this.input.enrollmentId,
        academicYearId: this.input.academicYearId,
        academicTermId: this.input.academicTermId ?? null,
      },
      { dryRun: this.input.dryRun ?? false }
    );
  }
}
