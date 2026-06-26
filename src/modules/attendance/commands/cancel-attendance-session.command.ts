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
  cancelAttendanceSessionSchema,
  type CancelAttendanceSessionSchema,
} from "@/modules/attendance/schemas/attendance.schema";

export class CancelAttendanceSessionCommand extends BaseCommand<
  CancelAttendanceSessionSchema,
  void
> {
  async validate(): Promise<void> {
    cancelAttendanceSessionSchema.parse(this.input);
    const session = await findAttendanceSessionById(
      this.input.sessionId,
      this.context.organizationId
    );
    if (!session) throw new NotFoundError("Sessão de presença", this.input.sessionId);
    if (session.status === "CANCELLED") {
      throw new BusinessRuleError("A sessão já está cancelada.");
    }
    if (session.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível cancelar uma sessão arquivada.");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SESSIONS_CANCEL)) {
      throw new AuthorizationError();
    }
    // Defense-in-depth against write IDOR: a teacher-scoped user may only cancel
    // a session they teach. No-op for admins/secretaries.
    await assertTeacherCanAccessAttendanceSession(this.context as AuthContext, this.input.sessionId);
  }

  async execute(): Promise<void> {
    const session = await updateAttendanceSession(
      this.input.sessionId,
      this.context.organizationId,
      { status: "CANCELLED" }
    );

    await auditService.log(this.context, {
      entity: "AttendanceSession",
      entityId: session.id,
      action: "attendance_session.cancelled",
      newValues: { status: "CANCELLED", reason: this.input.reason },
    });
  }
}
