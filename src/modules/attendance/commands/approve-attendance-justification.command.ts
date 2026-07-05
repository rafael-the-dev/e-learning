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
    // Fix H2 (end-to-end) — an approved justification is an ACCOMMODATION layered
    // on top of the recorded reality; the weighting engine interprets it as an
    // excused EFFECT. It MUST NOT replace the factual attendance record. This
    // command therefore updates ONLY the AttendanceJustification. It deliberately
    // does NOT set the record to EXCUSED, does NOT zero `minutesAttended`, and does
    // NOT touch `lateMinutes` / `markedByUserId` / `markedAt`. The calc-record
    // queries pick the approval up via `hasApprovedJustification` (the APPROVED
    // justification relation), so a justified LATE keeps its partial minutes
    // instead of collapsing to 0.
    //
    // (Pre-fix this command overwrote the record to `EXCUSED` + 0 minutes, which
    // destroyed the original fact and made the pure H2 weighting fix unreachable
    // in production — see docs/attendance-engine.md → "Justified records never
    // reduce attendance". Legacy `EXCUSED` primary rows still exist and remain
    // interpreted as an excused absence for backward compatibility, but the
    // approval workflow never creates new ones.)
    const justification = await updateJustificationStatus(
      this.input.justificationId,
      this.context.organizationId,
      {
        status: "APPROVED",
        reviewedByUserId: this.context.userId,
        reviewedAt: new Date(),
        reviewNotes: this.input.reviewNotes ?? null,
      }
    );

    await auditService.log(this.context, {
      entity: "AttendanceJustification",
      entityId: justification.id,
      action: "attendance_justification.approved",
      // validate() guarantees the justification was PENDING before this write.
      oldValues: { status: "PENDING" },
      newValues: {
        status: "APPROVED",
        reviewNotes: this.input.reviewNotes ?? null,
        attendanceRecordId: justification.attendanceRecordId,
        // The factual attendance record is intentionally preserved (not mutated).
        attendanceRecordStatusPreserved: justification.attendanceRecord?.status ?? null,
        reviewedByUserId: this.context.userId,
      },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.ATTENDANCE_JUSTIFICATION_APPROVED,
      aggregateType: DomainAggregateType.ATTENDANCE_JUSTIFICATION,
      aggregateId: justification.id,
      payload: {
        justificationId: justification.id,
        studentId: justification.studentId,
        attendanceRecordId: justification.attendanceRecordId,
        reviewNotes: this.input.reviewNotes ?? null,
        reviewedByUserId: this.context.userId,
      },
      actorId: this.context.userId,
    });

    // Attendance Engine Phase 3: the approved excuse changes the INTERPRETED
    // summary (never the record). Best-effort subject recalc.
    triggerAttendanceSummaryRecalcForRecord(this.context, justification.attendanceRecordId);
    // Attendance Engine Phase 4: period reporting summary too. Best-effort.
    triggerPeriodSummaryRecalcForRecord(this.context, justification.attendanceRecordId);

    return justification;
  }
}
