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
import {
  findLessonByIdInOrganization,
  findLessonBySlugInOrganization,
  updateLesson,
} from "@/modules/lessons/repositories/lesson.repository";
import { updateLessonSchema, type UpdateLessonSchema } from "@/modules/lessons/schemas/lesson.schema";
import type { Lesson } from "@/modules/lessons/types";

export class UpdateLessonCommand extends BaseCommand<UpdateLessonSchema, Lesson> {
  async validate(): Promise<void> {
    const result = updateLessonSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findLessonByIdInOrganization(
      this.input.lessonId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Lição", this.input.lessonId);

    if (this.input.slug && this.input.slug !== existing.slug) {
      const slugConflict = await findLessonBySlugInOrganization(
        this.input.slug,
        this.context.organizationId
      );
      if (slugConflict) {
        throw new BusinessRuleError("Já existe uma lição com este slug nesta organização");
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSONS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Lesson> {
    const before = await findLessonByIdInOrganization(
      this.input.lessonId,
      this.context.organizationId
    );

    const { lessonId, ...data } = this.input;
    const lesson = await updateLesson(lessonId, this.context.organizationId, data);

    await auditService.log(this.context, {
      entity: "Lesson",
      entityId: lesson.id,
      action: "lesson.updated",
      oldValues: { title: before?.title, slug: before?.slug },
      newValues: { title: lesson.title, slug: lesson.slug },
    });

    return lesson;
  }
}
