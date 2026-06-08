import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findSubjectLessonByIdInOrganization,
  softDeleteSubjectLesson,
} from "@/modules/lessons/repositories/subject-lesson.repository";

export class RemoveLessonFromSubjectCommand extends BaseCommand<
  { subjectLessonId: string },
  void
> {
  async validate(): Promise<void> {
    const sl = await findSubjectLessonByIdInOrganization(
      this.input.subjectLessonId,
      this.context.organizationId
    );
    if (!sl) throw new NotFoundError("Atribuição de lição", this.input.subjectLessonId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.SUBJECT_LESSONS_REMOVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteSubjectLesson(this.input.subjectLessonId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "SubjectLesson",
      entityId: this.input.subjectLessonId,
      action: "subject_lesson.removed",
    });
  }
}
