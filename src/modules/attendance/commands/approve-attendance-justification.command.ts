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
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import {
  findJustificationById,
} from "@/modules/attendance/repositories/attendance-justification.repository";
import {
  approveAttendanceJustificationSchema,
  type ApproveAttendanceJustificationSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { AttendanceJustification } from "@/modules/attendance/types";
import { triggerAttendanceSummaryRecalcForRecord } from "@/modules/attendance/services/student-subject-attendance-summary.service";
import { triggerPeriodSummaryRecalcForRecord } from "@/modules/attendance/services/student-period-attendance-summary.service";

export class ApproveAttendanceJustificationCommand extends BaseCommand<
  ApproveAttendanceJustificationSchema,
  AttendanceJustification
> {
  async validate(): Promise<void> {
    const result = approveAttendanceJustificationSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const justification = await findJustificationById(
      this.input.justificationId,
      this.context.organizationId
    );
    if (!justification) {
      throw new NotFoundError("Justificação de presença", this.input.justificationId);
    }
    if (justification.status !== "PENDING") {
      throw new BusinessRuleError("Apenas justificações pendentes podem ser aprovadas.");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_APPROVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AttendanceJustification> {
    const db = await getDb();
    const now = new Date();

    // Both writes must be atomic: if updating the underlying record fails,
    // the justification must not be left in APPROVED state.
    let justification: AttendanceJustification;

    await db.$transaction(async (tx) => {
      // 1. Approve the justification
      const justRow = await tx.attendanceJustification.update({
        where: { id: this.input.justificationId },
        data: {
          status: "APPROVED",
          reviewedByUserId: this.context.userId,
          reviewedAt: now,
          reviewNotes: this.input.reviewNotes ?? null,
        },
        select: {
          id: true,
          organizationId: true,
          attendanceRecordId: true,
          studentId: true,
          reason: true,
          attachmentUrl: true,
          status: true,
          reviewedByUserId: true,
          reviewedAt: true,
          reviewNotes: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          attendanceRecord: {
            select: {
              id: true,
              status: true,
              attendanceSession: {
                select: {
                  id: true,
                  sessionDate: true,
                  subject: { select: { name: true } },
                  classGroup: { select: { name: true } },
                },
              },
            },
          },
        },
      });

      // 2. Mark the underlying attendance record as EXCUSED and zero out minutes
      await tx.attendanceRecord.updateMany({
        where: { id: justRow.attendanceRecordId, organizationId: this.context.organizationId },
        data: {
          status: "EXCUSED",
          minutesAttended: 0,
          markedByUserId: this.context.userId,
          markedAt: now,
        },
      });

      justification = {
        id: justRow.id,
        organizationId: justRow.organizationId,
        attendanceRecordId: justRow.attendanceRecordId,
        studentId: justRow.studentId,
        reason: justRow.reason,
        attachmentUrl: justRow.attachmentUrl,
        status: justRow.status,
        reviewedByUserId: justRow.reviewedByUserId,
        reviewedAt: justRow.reviewedAt,
        reviewNotes: justRow.reviewNotes,
        createdAt: justRow.createdAt,
        updatedAt: justRow.updatedAt,
        deletedAt: justRow.deletedAt,
        student: justRow.student ?? undefined,
        attendanceRecord: justRow.attendanceRecord ?? undefined,
      };
    });

    await auditService.log(this.context, {
      entity: "AttendanceJustification",
      entityId: justification!.id,
      action: "attendance_justification.approved",
      newValues: {
        status: "APPROVED",
        reviewNotes: this.input.reviewNotes,
        attendanceRecordId: justification!.attendanceRecordId,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED,
      aggregateType: DomainAggregateType.ATTENDANCE_JUSTIFICATION,
      aggregateId: justification!.id,
      payload: {
        justificationId: justification!.id,
        studentId: justification!.studentId,
        attendanceRecordId: justification!.attendanceRecordId,
        reviewNotes: this.input.reviewNotes ?? null,
        reviewedByUserId: this.context.userId,
      },
      actorId: this.context.userId,
    });

    // Attendance Engine Phase 3: the approved excuse changes the summary. Best-effort.
    triggerAttendanceSummaryRecalcForRecord(this.context, justification!.attendanceRecordId);
    // Attendance Engine Phase 4: period reporting summary too. Best-effort.
    triggerPeriodSummaryRecalcForRecord(this.context, justification!.attendanceRecordId);

    return justification!;
  }
}
