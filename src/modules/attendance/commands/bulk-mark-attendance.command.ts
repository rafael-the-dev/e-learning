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
import { findAttendanceSessionById } from "@/modules/attendance/repositories/attendance-session.repository";
import { upsertAttendanceRecord } from "@/modules/attendance/repositories/attendance-record.repository";
import {
  bulkMarkAttendanceSchema,
  type BulkMarkAttendanceSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { AttendanceRecord } from "@/modules/attendance/types";

export class BulkMarkAttendanceCommand extends BaseCommand<
  BulkMarkAttendanceSchema,
  AttendanceRecord[]
> {
  async validate(): Promise<void> {
    const result = bulkMarkAttendanceSchema.safeParse(this.input);
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
    if (session.status === "COMPLETED") {
      throw new BusinessRuleError("Não é possível marcar presenças numa sessão já concluída.");
    }
    if (session.status === "CANCELLED") {
      throw new BusinessRuleError("Não é possível marcar presenças numa sessão cancelada.");
    }

    const db = await getDb();
    const studentIds = this.input.records.map((r) => r.studentId);
    const enrollments = await db.enrollment.findMany({
      where: {
        studentId: { in: studentIds },
        classGroupId: session.classGroupId,
        organizationId: this.context.organizationId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { studentId: true },
    });
    const enrolledIds = new Set(enrollments.map((e) => e.studentId));
    const unenrolled = studentIds.filter((id) => !enrolledIds.has(id));
    if (unenrolled.length > 0) {
      throw new BusinessRuleError(
        `${unenrolled.length} aluno(s) não estão matriculados nesta turma.`
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_RECORDS_MARK)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AttendanceRecord[]> {
    const session = await findAttendanceSessionById(
      this.input.sessionId,
      this.context.organizationId
    );
    if (!session) throw new NotFoundError("Sessão de presença", this.input.sessionId);

    // Open the session if it was DRAFT
    if (session.status === "DRAFT") {
      const { updateAttendanceSession } = await import(
        "@/modules/attendance/repositories/attendance-session.repository"
      );
      await updateAttendanceSession(session.id, this.context.organizationId, { status: "OPEN" });
    }

    const now = new Date();
    const records: AttendanceRecord[] = [];

    for (const rec of this.input.records) {
      let minutesAttended = 0;
      if (rec.minutesAttended != null) {
        minutesAttended = rec.minutesAttended;
      } else if (rec.status === "PRESENT" || rec.status === "REMOTE") {
        minutesAttended = session.durationMinutes;
      } else if (rec.status === "LATE") {
        const late = rec.lateMinutes ?? 0;
        minutesAttended = Math.max(0, session.durationMinutes - late);
      }

      const record = await upsertAttendanceRecord({
        organizationId: this.context.organizationId,
        attendanceSessionId: this.input.sessionId,
        studentId: rec.studentId,
        enrollmentId: rec.enrollmentId ?? null,
        status: rec.status,
        lateMinutes: rec.lateMinutes ?? null,
        minutesAttended,
        markedByUserId: this.context.userId,
        markedAt: now,
        notes: rec.notes ?? null,
      });
      records.push(record);
    }

    await auditService.log(this.context, {
      entity: "AttendanceSession",
      entityId: this.input.sessionId,
      action: "attendance_record.marked",
      newValues: {
        sessionId: this.input.sessionId,
        count: this.input.records.length,
      },
    });

    return records;
  }
}
