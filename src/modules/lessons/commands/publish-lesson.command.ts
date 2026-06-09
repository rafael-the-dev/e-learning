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
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";

export class PublishLessonCommand extends BaseCommand<{ lessonId: string }, void> {
  async validate(): Promise<void> {
    const lesson = await findLessonByIdInOrganization(
      this.input.lessonId,
      this.context.organizationId
    );
    if (!lesson) throw new NotFoundError("Lição", this.input.lessonId);
    if (lesson.status === "PUBLISHED") {
      throw new BusinessRuleError("A lição já está publicada");
    }
    if (lesson.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível publicar uma lição arquivada");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSONS_PUBLISH)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await updateLesson(this.input.lessonId, this.context.organizationId, {
      status: "PUBLISHED",
    });

    await auditService.log(this.context, {
      entity: "Lesson",
      entityId: this.input.lessonId,
      action: "lesson.published",
      newValues: { status: "PUBLISHED" },
    });

    await eventPublisher.publish({
      organizationId: this.context.organizationId,
      eventType: DomainEventType.LESSON_PUBLISHED,
      aggregateType: DomainAggregateType.LESSON,
      aggregateId: this.input.lessonId,
      actorId: this.context.userId,
      payload: { lessonId: this.input.lessonId },
    });
  }
}
