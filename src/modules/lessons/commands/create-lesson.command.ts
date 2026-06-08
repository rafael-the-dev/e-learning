import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createLesson, findLessonBySlugInOrganization } from "@/modules/lessons/repositories/lesson.repository";
import { createLessonSchema, type CreateLessonSchema } from "@/modules/lessons/schemas/lesson.schema";
import type { Lesson } from "@/modules/lessons/types";

export class CreateLessonCommand extends BaseCommand<CreateLessonSchema, Lesson> {
  async validate(): Promise<void> {
    const result = createLessonSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findLessonBySlugInOrganization(
      this.input.slug,
      this.context.organizationId
    );
    if (existing) {
      throw new BusinessRuleError("Já existe uma lição com este slug nesta organização");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSONS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Lesson> {
    const lesson = await createLesson({
      organizationId: this.context.organizationId,
      title: this.input.title,
      slug: this.input.slug,
      description: this.input.description ?? null,
      summary: this.input.summary ?? null,
      objectives: this.input.objectives ?? null,
      durationMinutes: this.input.durationMinutes ?? null,
      lessonType: this.input.lessonType,
      videoProvider: this.input.videoProvider ?? "NONE",
      videoUrl: this.input.videoUrl ?? null,
      externalVideoId: this.input.externalVideoId ?? null,
      thumbnailUrl: this.input.thumbnailUrl ?? null,
      status: this.input.status ?? "DRAFT",
    });

    await auditService.log(this.context, {
      entity: "Lesson",
      entityId: lesson.id,
      action: "lesson.created",
      newValues: { title: lesson.title, slug: lesson.slug, lessonType: lesson.lessonType, status: lesson.status },
    });

    return lesson;
  }
}
