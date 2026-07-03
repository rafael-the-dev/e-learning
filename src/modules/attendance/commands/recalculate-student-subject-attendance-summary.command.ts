import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { recalculateStudentSubjectAttendanceSummary } from "@/modules/attendance/services/student-subject-attendance-summary.service";
import type { AttendanceSummaryRecalcResult } from "@/modules/attendance/types";

// =============================================================================
// RecalculateStudentSubjectAttendanceSummaryCommand — Attendance Engine Phase 3
//
// Explicit, RBAC-guarded, transactional recompute of ONE summary. Delegates to
// the single-writer service. Behaviour-neutral (summary read-model only).
// =============================================================================

export interface RecalcSummaryInput {
  enrollmentId: string;
  levelSubjectId: string;
}

export class RecalculateStudentSubjectAttendanceSummaryCommand extends BaseCommand<
  RecalcSummaryInput,
  AttendanceSummaryRecalcResult
> {
  async validate(): Promise<void> {
    if (!this.input.enrollmentId || !this.input.levelSubjectId) {
      throw new ValidationError("Dados inválidos", {
        ...(!this.input.enrollmentId ? { enrollmentId: ["Obrigatório."] } : {}),
        ...(!this.input.levelSubjectId ? { levelSubjectId: ["Obrigatório."] } : {}),
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

  async execute(): Promise<AttendanceSummaryRecalcResult> {
    return recalculateStudentSubjectAttendanceSummary(this.context, {
      enrollmentId: this.input.enrollmentId,
      levelSubjectId: this.input.levelSubjectId,
    });
  }
}
