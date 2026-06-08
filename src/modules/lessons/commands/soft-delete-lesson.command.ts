import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findLessonByIdInOrganization,
  softDeleteLesson,
} from "@/modules/lessons/repositories/lesson.repository";

export class SoftDeleteLessonCommand extends BaseCommand<{ lessonId: string }, void> {
  async validate(): Promise<void> {
    const lesson = await findLessonByIdInOrganization(
      this.input.lessonId,
      this.context.organizationId
    );
    if (!lesson) throw new NotFoundError("Lição", this.input.lessonId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSONS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteLesson(this.input.lessonId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "Lesson",
      entityId: this.input.lessonId,
      action: "lesson.deleted",
    });
  }
}
