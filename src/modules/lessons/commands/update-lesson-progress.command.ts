import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import { upsertLessonProgress } from "@/modules/lessons/repositories/lesson-progress.repository";
import {
  updateLessonProgressSchema,
  type UpdateLessonProgressSchema,
} from "@/modules/lessons/schemas/subject-lesson.schema";
import type { StudentLessonProgress } from "@/modules/lessons/types";

export class UpdateLessonProgressCommand extends BaseCommand<
  UpdateLessonProgressSchema,
  StudentLessonProgress
> {
  async validate(): Promise<void> {
    const result = updateLessonProgressSchema.safeParse(this.input);
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
    const enrollment = await db.enrollment.findFirst({
      where: {
        id: this.input.enrollmentId,
        organizationId: this.context.organizationId,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: { id: true, studentId: true },
    });
    if (!enrollment) {
      throw new BusinessRuleError(
        "Não tem uma inscrição ativa que permita acesso a esta lição"
      );
    }

    const lesson = await db.lesson.findFirst({
      where: {
        id: this.input.lessonId,
        organizationId: this.context.organizationId,
        status: "PUBLISHED",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!lesson) {
      throw new BusinessRuleError("Lição não disponível");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSON_PROGRESS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<StudentLessonProgress> {
    const isCompleted = this.input.progressPercentage >= 100;
    const status = isCompleted
      ? "COMPLETED"
      : this.input.watchedSeconds > 0 || this.input.progressPercentage > 0
      ? "IN_PROGRESS"
      : "NOT_STARTED";

    const db = await getDb();
    const enrollment = await db.enrollment.findFirst({
      where: { id: this.input.enrollmentId, organizationId: this.context.organizationId },
      select: { studentId: true },
    });

    const subjectLesson = await db.subjectLesson.findFirst({
      where: {
        subjectId: this.input.subjectId,
        lessonId: this.input.lessonId,
        organizationId: this.context.organizationId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const progress = await upsertLessonProgress({
      organizationId: this.context.organizationId,
      studentId: enrollment!.studentId,
      enrollmentId: this.input.enrollmentId,
      subjectId: this.input.subjectId,
      lessonId: this.input.lessonId,
      subjectLessonId: subjectLesson?.id ?? null,
      watchedSeconds: this.input.watchedSeconds,
      progressPercentage: this.input.progressPercentage,
      status,
      completedAt: isCompleted ? new Date() : null,
      lastAccessedAt: new Date(),
    });

    await auditService.log(this.context, {
      entity: "StudentLessonProgress",
      entityId: progress.id,
      action: "lesson_progress.updated",
      newValues: {
        lessonId: this.input.lessonId,
        progressPercentage: this.input.progressPercentage,
        status,
      },
    });

    return progress;
  }
}
