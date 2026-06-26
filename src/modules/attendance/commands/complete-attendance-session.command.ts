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

    // Evaluate attendance risk for all enrolled students AFTER completing the session.
    // This runs async — failure must not roll back the completion.
    evaluateAttendanceRiskForSession(
      session.id,
      this.context.organizationId
    ).catch((err) =>
      console.error("[CompleteAttendanceSessionCommand] risk evaluation failed", err)
    );
  }
}
