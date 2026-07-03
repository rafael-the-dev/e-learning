import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessAttendanceSession } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import { findAttendanceSessionById } from "@/modules/attendance/repositories/attendance-session.repository";
import { upsertAttendanceRecord } from "@/modules/attendance/repositories/attendance-record.repository";
import { triggerAttendanceSummaryRecalcForRecord } from "@/modules/attendance/services/student-subject-attendance-summary.service";
import { triggerPeriodSummaryRecalcForRecord } from "@/modules/attendance/services/student-period-attendance-summary.service";
import {
  markAttendanceSchema,
  type MarkAttendanceSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { AttendanceRecord } from "@/modules/attendance/types";

export class MarkAttendanceCommand extends BaseCommand<MarkAttendanceSchema, AttendanceRecord> {
  async validate(): Promise<void> {
    const result = markAttendanceSchema.safeParse(this.input);
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
    const enrollment = await db.enrollment.findFirst({
      where: {
        studentId: this.input.studentId,
        classGroupId: session.classGroupId,
        organizationId: this.context.organizationId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!enrollment) {
      throw new BusinessRuleError("O aluno não está matriculado nesta turma.");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_RECORDS_MARK)) {
      throw new AuthorizationError();
    }
    // Defense-in-depth against write IDOR: a teacher-scoped user may only mark a
    // session they teach. No-op for admins/secretaries. See docs/teacher-access-scope.md.
    await assertTeacherCanAccessAttendanceSession(this.context as AuthContext, this.input.sessionId);
  }

  async execute(): Promise<AttendanceRecord> {
    const session = await findAttendanceSessionById(
      this.input.sessionId,
      this.context.organizationId
    );
    if (!session) throw new NotFoundError("Sessão de presença", this.input.sessionId);

    if (session.status === "DRAFT") {
      const { updateAttendanceSession } = await import(
        "@/modules/attendance/repositories/attendance-session.repository"
      );
      await updateAttendanceSession(session.id, this.context.organizationId, { status: "OPEN" });
    }

    let minutesAttended = 0;
    if (this.input.minutesAttended != null) {
      minutesAttended = this.input.minutesAttended;
    } else if (this.input.status === "PRESENT" || this.input.status === "REMOTE") {
      minutesAttended = session.durationMinutes;
    } else if (this.input.status === "LATE") {
      const late = this.input.lateMinutes ?? 0;
      minutesAttended = Math.max(0, session.durationMinutes - late);
    }

    // Resolve the enrolment so new records carry enrollmentId (Phase 2 intent) and
    // the summary trigger can attribute the record. Behaviour-neutral.
    const db = await getDb();
    const enrollment = await db.enrollment.findFirst({
      where: {
        studentId: this.input.studentId,
        classGroupId: session.classGroupId,
        organizationId: this.context.organizationId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true },
    });

    const record = await upsertAttendanceRecord({
      organizationId: this.context.organizationId,
      attendanceSessionId: this.input.sessionId,
      studentId: this.input.studentId,
      enrollmentId: enrollment?.id ?? null,
      status: this.input.status,
      lateMinutes: this.input.lateMinutes ?? null,
      minutesAttended,
      markedByUserId: this.context.userId,
      markedAt: new Date(),
      notes: this.input.notes ?? null,
    });

    await auditService.log(this.context, {
      entity: "AttendanceRecord",
      entityId: record.id,
      action: "attendance_record.marked",
      newValues: { sessionId: this.input.sessionId, studentId: this.input.studentId, status: this.input.status },
    });

    // Attendance Engine Phase 3: recompute this enrolment's summary. Best-effort.
    triggerAttendanceSummaryRecalcForRecord(this.context, record.id);
    // Attendance Engine Phase 4: recompute the period reporting summary. Best-effort.
    triggerPeriodSummaryRecalcForRecord(this.context, record.id);

    return record;
  }
}
