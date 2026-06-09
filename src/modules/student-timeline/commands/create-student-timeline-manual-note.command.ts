import { BaseCommand, ValidationError, AuthorizationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { createTimelineEvent } from "@/modules/student-timeline/repositories/student-timeline.repository";
import {
  createManualNoteSchema,
  type CreateManualNoteSchema,
} from "@/modules/student-timeline/schemas/student-timeline.schema";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";

// =============================================================================
// CREATE STUDENT TIMELINE MANUAL NOTE COMMAND
// Staff-initiated annotation on a student's timeline.
// =============================================================================

export class CreateStudentTimelineManualNoteCommand extends BaseCommand<
  CreateManualNoteSchema,
  StudentTimelineEvent
> {
  async validate(): Promise<void> {
    const result = createManualNoteSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const db = await getDb();
    const student = await db.student.findFirst({
      where: {
        id: this.input.studentId,
        organizationId: this.context.organizationId,
        deletedAt: null,
      },
    });
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.STUDENT_TIMELINE_CREATE_NOTE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<StudentTimelineEvent> {
    const occurredAt = new Date(this.input.occurredAt);

    const event = await createTimelineEvent({
      organizationId: this.context.organizationId,
      studentId: this.input.studentId,
      eventType: "MANUAL_NOTE",
      title: this.input.title,
      description: this.input.description ?? null,
      referenceType: null,
      referenceId: null,
      actorUserId: this.context.userId,
      visibility: "INTERNAL",
      metadata: this.input.metadata ?? null,
      occurredAt,
    });

    await auditService.log(this.context, {
      entity: "StudentTimelineEvent",
      entityId: event.id,
      action: "student_timeline.manual_note_created",
      newValues: {
        studentId: this.input.studentId,
        title: this.input.title,
        occurredAt: occurredAt.toISOString(),
      },
    });

    return event;
  }
}
