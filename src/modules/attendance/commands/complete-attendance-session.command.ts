import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessAttendanceSession } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAttendanceSessionById,
  updateAttendanceSession,
} from "@/modules/attendance/repositories/attendance-session.repository";
import {
  completeAttendanceSessionSchema,
  type CompleteAttendanceSessionSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import { evaluateAttendanceRiskForSession } from "@/modules/attendance/services/attendance-risk.service";
import { recalculateSummariesForSession } from "@/modules/attendance/services/student-subject-attendance-summary.service";
import { triggerPeriodSummaryRecalcForSession } from "@/modules/attendance/services/student-period-attendance-summary.service";

export class CompleteAttendanceSessionCommand extends BaseCommand<
  CompleteAttendanceSessionSchema,
  void
> {
  async validate(): Promise<void> {
    completeAttendanceSessionSchema.parse(this.input);
    const session = await findAttendanceSessionById(
      this.input.sessionId,
      this.context.organizationId
    );
    if (!session) throw new NotFoundError("Sessão de presença", this.input.sessionId);
    if (session.status === "COMPLETED") {
      throw new BusinessRuleError("A sessão já está concluída.");
    }
    if (session.status === "CANCELLED") {
      throw new BusinessRuleError("Não é possível concluir uma sessão cancelada.");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SESSIONS_COMPLETE)) {
      throw new AuthorizationError();
    }
    // Defense-in-depth against write IDOR: a teacher-scoped user may only complete
    // a session they teach. No-op for admins/secretaries.
    await assertTeacherCanAccessAttendanceSession(this.context as AuthContext, this.input.sessionId);
  }

  async execute(): Promise<void> {
    const session = await updateAttendanceSession(
      this.input.sessionId,
      this.context.organizationId,
      { status: "COMPLETED" }
    );

    await auditService.log(this.context, {
      entity: "AttendanceSession",
      entityId: session.id,
      action: "attendance_session.completed",
      newValues: { status: "COMPLETED" },
    });

    // Attendance Engine Phase 3: recompute persisted summaries for every enrolment
    // in this session now that it counts, THEN evaluate attendance risk from those
    // fresh summaries. Risk reads the persisted StudentSubjectAttendanceSummary
    // (source of truth), so the recalc MUST complete first — otherwise risk would
    // read a stale/absent summary. Both run async and best-effort: a failure here
    // must never roll back the completion (behaviour-neutral).
    void (async () => {
      await recalculateSummariesForSession(this.context, session.id);
      await evaluateAttendanceRiskForSession(session.id, this.context.organizationId);
    })().catch((err) =>
      console.error("[CompleteAttendanceSessionCommand] summary/risk post-processing failed", err)
    );

    // Attendance Engine Phase 4: recompute the period (year/term) reporting
    // summaries for the same enrolments. Best-effort, reporting-only.
    triggerPeriodSummaryRecalcForSession(this.context, session.id);
  }
}
