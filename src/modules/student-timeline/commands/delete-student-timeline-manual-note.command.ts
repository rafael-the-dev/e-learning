import { BaseCommand, ValidationError, AuthorizationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  findTimelineEventById,
  softDeleteTimelineEvent,
} from "@/modules/student-timeline/repositories/student-timeline.repository";
import {
  deleteManualNoteSchema,
  type DeleteManualNoteSchema,
} from "@/modules/student-timeline/schemas/student-timeline.schema";
import { auditService } from "@/modules/audit-logs/services/audit.service";

// =============================================================================
// DELETE STUDENT TIMELINE MANUAL NOTE COMMAND
// Only MANUAL_NOTE events can be soft-deleted. System events are immutable.
// =============================================================================

export class DeleteStudentTimelineManualNoteCommand extends BaseCommand<DeleteManualNoteSchema, string> {
  private _event: Awaited<ReturnType<typeof findTimelineEventById>> = null;

  async validate(): Promise<void> {
    const result = deleteManualNoteSchema.safeParse(this.input);
    if (!result.success) throw new ValidationError("Dados inválidos");

    const event = await findTimelineEventById(this.input.eventId, this.context.organizationId);
    if (!event) throw new NotFoundError("Evento de timeline", this.input.eventId);

    if (event.eventType !== "MANUAL_NOTE") {
      throw new BusinessRuleError("Apenas notas manuais podem ser eliminadas.");
    }

    this._event = event;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.STUDENT_TIMELINE_DELETE_NOTE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<string> {
    const event = this._event!;

    await softDeleteTimelineEvent(this.input.eventId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "StudentTimelineEvent",
      entityId: this.input.eventId,
      action: "student_timeline.manual_note_deleted",
      oldValues: {
        studentId: event.studentId,
        title: event.title,
        occurredAt: event.occurredAt.toISOString(),
      },
    });

    return event.studentId;
  }
}
