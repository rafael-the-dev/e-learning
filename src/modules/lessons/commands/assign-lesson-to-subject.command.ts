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
import { findLessonByIdInOrganization } from "@/modules/lessons/repositories/lesson.repository";
import {
  createSubjectLesson,
  findSubjectLessonByPair,
  getNextOrderForSubject,
} from "@/modules/lessons/repositories/subject-lesson.repository";
import { getDb } from "@/server/db";
import {
  assignLessonToSubjectSchema,
  type AssignLessonToSubjectSchema,
} from "@/modules/lessons/schemas/subject-lesson.schema";
import type { SubjectLesson } from "@/modules/lessons/types";

export class AssignLessonToSubjectCommand extends BaseCommand<
  AssignLessonToSubjectSchema,
  SubjectLesson
> {
  async validate(): Promise<void> {
    const result = assignLessonToSubjectSchema.safeParse(this.input);
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
      where: { id: this.input.subjectId, organizationId: this.context.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!subject) throw new NotFoundError("Disciplina", this.input.subjectId);

    const lesson = await findLessonByIdInOrganization(
      this.input.lessonId,
      this.context.organizationId
    );
    if (!lesson) throw new NotFoundError("Lição", this.input.lessonId);

    const duplicate = await findSubjectLessonByPair(
      this.input.subjectId,
      this.input.lessonId
    );
    if (duplicate) {
      throw new BusinessRuleError("Esta lição já está atribuída a esta disciplina");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.SUBJECT_LESSONS_ASSIGN)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<SubjectLesson> {
    const order = await getNextOrderForSubject(this.input.subjectId);

    const subjectLesson = await createSubjectLesson({
      organizationId: this.context.organizationId,
      subjectId: this.input.subjectId,
      lessonId: this.input.lessonId,
      order,
      isRequired: this.input.isRequired ?? false,
      minWatchPercentage: this.input.minWatchPercentage ?? 0,
      unlockAfterLessonId: this.input.unlockAfterLessonId ?? null,
    });

    await auditService.log(this.context, {
      entity: "SubjectLesson",
      entityId: subjectLesson.id,
      action: "subject_lesson.assigned",
      newValues: {
        subjectId: this.input.subjectId,
        lessonId: this.input.lessonId,
        order,
      },
    });

    return subjectLesson;
  }
}
