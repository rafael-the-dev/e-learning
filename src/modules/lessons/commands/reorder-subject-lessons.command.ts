import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import {
  reorderSubjectLessons,
} from "@/modules/lessons/repositories/subject-lesson.repository";
import {
  reorderSubjectLessonsSchema,
  type ReorderSubjectLessonsSchema,
} from "@/modules/lessons/schemas/subject-lesson.schema";

export class ReorderSubjectLessonsCommand extends BaseCommand<
  ReorderSubjectLessonsSchema,
  void
> {
  async validate(): Promise<void> {
    const result = reorderSubjectLessonsSchema.safeParse(this.input);
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
    const subject = await db.subject.findFirst({
      where: {
        id: this.input.subjectId,
        organizationId: this.context.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!subject) throw new NotFoundError("Disciplina", this.input.subjectId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.SUBJECT_LESSONS_REORDER)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await reorderSubjectLessons(
      this.input.subjectId,
      this.context.organizationId,
      this.input.orderedIds
    );

    await auditService.log(this.context, {
      entity: "Subject",
      entityId: this.input.subjectId,
      action: "subject_lesson.reordered",
      newValues: { orderedIds: this.input.orderedIds },
    });
  }
}
