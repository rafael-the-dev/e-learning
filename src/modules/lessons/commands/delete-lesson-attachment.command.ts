import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findAttachmentByIdInOrganization,
  softDeleteAttachment,
} from "@/modules/lessons/repositories/lesson-attachment.repository";

export class DeleteLessonAttachmentCommand extends BaseCommand<
  { attachmentId: string; lessonId: string },
  void
> {
  async validate(): Promise<void> {
    const attachment = await findAttachmentByIdInOrganization(
      this.input.attachmentId,
      this.context.organizationId
    );
    if (!attachment) throw new NotFoundError("Anexo", this.input.attachmentId);
    if (attachment.lessonId !== this.input.lessonId) {
      throw new NotFoundError("Anexo", this.input.attachmentId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSON_ATTACHMENTS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteAttachment(this.input.attachmentId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "LessonAttachment",
      entityId: this.input.attachmentId,
      action: "lesson_attachment.deleted",
      newValues: { lessonId: this.input.lessonId },
    });
  }
}
