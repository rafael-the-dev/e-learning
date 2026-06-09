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
import { findRecordById } from "@/modules/attendance/repositories/attendance-record.repository";
import {
  createJustification,
  hasPendingJustificationForRecord,
} from "@/modules/attendance/repositories/attendance-justification.repository";
import {
  createAttendanceJustificationSchema,
  type CreateAttendanceJustificationSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { AttendanceJustification } from "@/modules/attendance/types";

export class CreateAttendanceJustificationCommand extends BaseCommand<
  CreateAttendanceJustificationSchema,
  AttendanceJustification
> {
  async validate(): Promise<void> {
    const result = createAttendanceJustificationSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const record = await findRecordById(
      this.input.attendanceRecordId,
      this.context.organizationId
    );
    if (!record) {
      throw new NotFoundError("Registo de presença", this.input.attendanceRecordId);
    }
    if (record.status !== "ABSENT" && record.status !== "LATE") {
      throw new BusinessRuleError(
        "Só é possível justificar faltas ou atrasos. O registo actual não é justificável."
      );
    }

    const hasPending = await hasPendingJustificationForRecord(
      this.input.attendanceRecordId,
      this.context.organizationId
    );
    if (hasPending) {
      throw new BusinessRuleError(
        "Já existe uma justificação pendente para este registo de presença."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_CREATE)) {
      throw new AuthorizationError();
    }

    // Students may only justify their own attendance records
    const db = await getDb();
    const studentProfile = await db.student.findFirst({
      where: { userId: this.context.userId, organizationId: this.context.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (studentProfile) {
      const record = await db.attendanceRecord.findFirst({
        where: { id: this.input.attendanceRecordId, organizationId: this.context.organizationId, deletedAt: null },
        select: { studentId: true },
      });
      if (!record || record.studentId !== studentProfile.id) {
        throw new AuthorizationError();
      }
    }
  }

  async execute(): Promise<AttendanceJustification> {
    const record = await findRecordById(
      this.input.attendanceRecordId,
      this.context.organizationId
    );
    if (!record) throw new NotFoundError("Registo de presença", this.input.attendanceRecordId);

    const justification = await createJustification({
      organizationId: this.context.organizationId,
      attendanceRecordId: this.input.attendanceRecordId,
      studentId: record.studentId,
      reason: this.input.reason,
      attachmentUrl: this.input.attachmentUrl ?? null,
    });

    await auditService.log(this.context, {
      entity: "AttendanceJustification",
      entityId: justification.id,
      action: "attendance_justification.created",
      newValues: {
        attendanceRecordId: this.input.attendanceRecordId,
        studentId: record.studentId,
      },
    });

    return justification;
  }
}
