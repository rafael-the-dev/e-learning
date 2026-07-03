import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findRecordById,
  updateAttendanceRecord,
} from "@/modules/attendance/repositories/attendance-record.repository";
import {
  findAttendanceSessionById,
} from "@/modules/attendance/repositories/attendance-session.repository";
import {
  updateAttendanceRecordSchema,
  type UpdateAttendanceRecordSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import { triggerAttendanceSummaryRecalcForRecord } from "@/modules/attendance/services/student-subject-attendance-summary.service";
import { triggerPeriodSummaryRecalcForRecord } from "@/modules/attendance/services/student-period-attendance-summary.service";
import type { AttendanceRecord } from "@/modules/attendance/types";

export class UpdateAttendanceRecordCommand extends BaseCommand<
  UpdateAttendanceRecordSchema,
  AttendanceRecord
> {
  async validate(): Promise<void> {
    const result = updateAttendanceRecordSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }
    const record = await findRecordById(this.input.recordId, this.context.organizationId);
    if (!record) throw new NotFoundError("Registo de presença", this.input.recordId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_RECORDS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AttendanceRecord> {
    const existing = await findRecordById(this.input.recordId, this.context.organizationId);
    if (!existing) throw new NotFoundError("Registo de presença", this.input.recordId);

    const session = await findAttendanceSessionById(
      existing.attendanceSessionId,
      this.context.organizationId
    );
    const sessionMinutes = session?.durationMinutes ?? 0;

    let minutesAttended = existing.minutesAttended;
    if (this.input.minutesAttended != null) {
      minutesAttended = this.input.minutesAttended;
    } else if (this.input.status === "PRESENT" || this.input.status === "REMOTE") {
      minutesAttended = sessionMinutes;
    } else if (this.input.status === "LATE") {
      const late = this.input.lateMinutes ?? 0;
      minutesAttended = Math.max(0, sessionMinutes - late);
    } else if (this.input.status === "ABSENT" || this.input.status === "EXCUSED") {
      minutesAttended = 0;
    }

    const record = await updateAttendanceRecord(
      this.input.recordId,
      this.context.organizationId,
      {
        status: this.input.status,
        lateMinutes: this.input.lateMinutes,
        minutesAttended,
        notes: this.input.notes,
        markedByUserId: this.context.userId,
        markedAt: new Date(),
      }
    );

    await auditService.log(this.context, {
      entity: "AttendanceRecord",
      entityId: record.id,
      action: "attendance_record.updated",
      oldValues: { status: existing.status, minutesAttended: existing.minutesAttended },
      newValues: { status: record.status, minutesAttended: record.minutesAttended },
    });

    // Attendance Engine Phase 3: recompute this enrolment's summary. Best-effort.
    triggerAttendanceSummaryRecalcForRecord(this.context, record.id);
    // Attendance Engine Phase 4: recompute the period reporting summary. Best-effort.
    triggerPeriodSummaryRecalcForRecord(this.context, record.id);

    return record;
  }
}
