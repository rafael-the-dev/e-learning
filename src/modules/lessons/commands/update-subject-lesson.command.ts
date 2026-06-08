import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findSubjectLessonByIdInOrganization,
  updateSubjectLesson,
} from "@/modules/lessons/repositories/subject-lesson.repository";
import {
  updateSubjectLessonSchema,
  type UpdateSubjectLessonSchema,
} from "@/modules/lessons/schemas/subject-lesson.schema";
import type { SubjectLesson } from "@/modules/lessons/types";

export class UpdateSubjectLessonCommand extends BaseCommand<
  UpdateSubjectLessonSchema,
  SubjectLesson
> {
  async validate(): Promise<void> {
    const result = updateSubjectLessonSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const sl = await findSubjectLessonByIdInOrganization(
      this.input.subjectLessonId,
      this.context.organizationId
    );
    if (!sl) throw new NotFoundError("Atribuição de lição", this.input.subjectLessonId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.SUBJECT_LESSONS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<SubjectLesson> {
    const before = await findSubjectLessonByIdInOrganization(
      this.input.subjectLessonId,
      this.context.organizationId
    );

    const { subjectLessonId, ...data } = this.input;
    const sl = await updateSubjectLesson(subjectLessonId, this.context.organizationId, data);

    await auditService.log(this.context, {
      entity: "SubjectLesson",
      entityId: sl.id,
      action: "subject_lesson.updated",
      oldValues: {
        isRequired: before?.isRequired,
        minWatchPercentage: before?.minWatchPercentage,
      },
      newValues: {
        isRequired: sl.isRequired,
        minWatchPercentage: sl.minWatchPercentage,
      },
    });

    return sl;
  }
}
