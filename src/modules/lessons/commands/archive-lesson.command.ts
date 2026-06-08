import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findLessonByIdInOrganization,
  updateLesson,
} from "@/modules/lessons/repositories/lesson.repository";

export class ArchiveLessonCommand extends BaseCommand<{ lessonId: string }, void> {
  async validate(): Promise<void> {
    const lesson = await findLessonByIdInOrganization(
      this.input.lessonId,
      this.context.organizationId
    );
    if (!lesson) throw new NotFoundError("Lição", this.input.lessonId);
    if (lesson.status === "ARCHIVED") {
      throw new BusinessRuleError("A lição já está arquivada");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSONS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateLesson(this.input.lessonId, this.context.organizationId, {
      status: "ARCHIVED",
    });

    await auditService.log(this.context, {
      entity: "Lesson",
      entityId: this.input.lessonId,
      action: "lesson.archived",
      newValues: { status: "ARCHIVED" },
    });
  }
}
