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
import {
  findJustificationById,
  updateJustificationStatus,
} from "@/modules/attendance/repositories/attendance-justification.repository";
import {
  rejectAttendanceJustificationSchema,
  type RejectAttendanceJustificationSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { AttendanceJustification } from "@/modules/attendance/types";
import { triggerAttendanceSummaryRecalcForRecord } from "@/modules/attendance/services/student-subject-attendance-summary.service";
import { triggerPeriodSummaryRecalcForRecord } from "@/modules/attendance/services/student-period-attendance-summary.service";

export class RejectAttendanceJustificationCommand extends BaseCommand<
  RejectAttendanceJustificationSchema,
  AttendanceJustification
> {
  async validate(): Promise<void> {
    const result = rejectAttendanceJustificationSchema.safeParse(this.input);
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
      throw new BusinessRuleError("Apenas justificações pendentes podem ser rejeitadas.");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_REJECT)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<AttendanceJustification> {
    // Fix H2 invariant: rejecting a justification updates ONLY the justification
    // review state. The factual AttendanceRecord (status / minutesAttended /
    // lateMinutes) is never mutated — the original attendance evidence is
    // preserved regardless of the review outcome.
    const justification = await updateJustificationStatus(
      this.input.justificationId,
      this.context.organizationId,
      {
        status: "REJECTED",
        reviewedByUserId: this.context.userId,
        reviewedAt: new Date(),
        reviewNotes: this.input.reviewNotes,
      }
    );

    await auditService.log(this.context, {
      entity: "AttendanceJustification",
      entityId: justification.id,
      action: "attendance_justification.rejected",
      newValues: {
        status: "REJECTED",
        reviewNotes: this.input.reviewNotes,
        attendanceRecordId: justification.attendanceRecordId,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.ATTENDANCE_JUSTIFICATION_REJECTED,
      aggregateType: DomainAggregateType.ATTENDANCE_JUSTIFICATION,
      aggregateId: justification.id,
      payload: {
        justificationId: justification.id,
        studentId: justification.studentId,
        attendanceRecordId: justification.attendanceRecordId,
        reviewNotes: this.input.reviewNotes,
        reviewedByUserId: this.context.userId,
      },
      actorId: this.context.userId,
    });

    // Attendance Engine Phase 3: a rejected justification removes any prior excuse
    // effect from the summary. Best-effort.
    triggerAttendanceSummaryRecalcForRecord(this.context, justification.attendanceRecordId);
    // Attendance Engine Phase 4: period reporting summary too. Best-effort.
    triggerPeriodSummaryRecalcForRecord(this.context, justification.attendanceRecordId);

    return justification;
  }
}
