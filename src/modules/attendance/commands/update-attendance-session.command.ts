import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import {
  findAttendanceSessionById,
  updateAttendanceSession,
} from "@/modules/attendance/repositories/attendance-session.repository";
import {
  updateAttendanceSessionSchema,
  type UpdateAttendanceSessionSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { AttendanceSession } from "@/modules/attendance/types";

export class UpdateAttendanceSessionCommand extends BaseCommand<
  UpdateAttendanceSessionSchema,
  AttendanceSession
> {
  async validate(): Promise<void> {
    const result = updateAttendanceSessionSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const session = await findAttendanceSessionById(
      this.input.sessionId,
      this.context.organizationId
    );
    if (!session) throw new NotFoundError("Sessão de presença", this.input.sessionId);
    if (session.status === "CANCELLED" || session.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível editar uma sessão cancelada ou arquivada.");
    }

    if (this.input.startTime && this.input.endTime) {
      if (this.input.startTime >= this.input.endTime) {
        throw new ValidationError("Dados inválidos", {
          endTime: ["A hora de fim deve ser posterior à hora de início"],
        });
      }
    }

    const db = await getDb();
    if (this.input.teacherId) {
      const teacher = await db.teacher.findFirst({
        where: { id: this.input.teacherId, organizationId: this.context.organizationId, deletedAt: null },
      });
      if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    }
    if (this.input.classroomId) {
      const classroom = await db.classroom.findFirst({
        where: { id: this.input.classroomId, organizationId: this.context.organizationId, deletedAt: null },
      });
      if (!classroom) throw new NotFoundError("Sala", this.input.classroomId);
    }
    if (this.input.scheduleSlotId) {
      const slot = await db.scheduleSlot.findFirst({
        where: { id: this.input.scheduleSlotId, organizationId: this.context.organizationId, deletedAt: null },
      });
      if (!slot) throw new NotFoundError("Slot de horário", this.input.scheduleSlotId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SESSIONS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AttendanceSession> {
    const updateData: Parameters<typeof updateAttendanceSession>[2] = {
      teacherId: this.input.teacherId,
      classroomId: this.input.classroomId,
      scheduleSlotId: this.input.scheduleSlotId,
      title: this.input.title,
      notes: this.input.notes,
    };

    if (this.input.sessionDate) updateData.sessionDate = new Date(this.input.sessionDate);
    if (this.input.startTime) updateData.startTime = this.input.startTime;
    if (this.input.endTime) updateData.endTime = this.input.endTime;

    if (this.input.startTime && this.input.endTime) {
      const [sh, sm] = this.input.startTime.split(":").map(Number);
      const [eh, em] = this.input.endTime.split(":").map(Number);
      updateData.durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
    }

    const session = await updateAttendanceSession(
      this.input.sessionId,
      this.context.organizationId,
      updateData
    );

    await auditService.log(this.context, {
      entity: "AttendanceSession",
      entityId: session.id,
      action: "attendance_session.updated",
      newValues: {
        teacherId: session.teacherId,
        classroomId: session.classroomId,
        sessionDate: session.sessionDate,
      },
    });

    return session;
  }
}
