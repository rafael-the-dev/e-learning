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
  findAttachmentByIdInOrganization,
  updateLessonAttachment,
} from "@/modules/lessons/repositories/lesson-attachment.repository";
import {
  updateLessonAttachmentSchema,
  type UpdateLessonAttachmentSchema,
} from "@/modules/lessons/schemas/lesson-attachment.schema";
import type { LessonAttachment } from "@/modules/lessons/types";

export class UpdateLessonAttachmentCommand extends BaseCommand<
  UpdateLessonAttachmentSchema,
  LessonAttachment
> {
  async validate(): Promise<void> {
    const result = updateLessonAttachmentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

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
    if (!createAbility(perms).can(PERMISSIONS.LESSON_ATTACHMENTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<LessonAttachment> {
    const before = await findAttachmentByIdInOrganization(
      this.input.attachmentId,
      this.context.organizationId
    );

    const { attachmentId, lessonId: _lessonId, ...data } = this.input;
    const attachment = await updateLessonAttachment(
      attachmentId,
      this.context.organizationId,
      data
    );

    await auditService.log(this.context, {
      entity: "LessonAttachment",
      entityId: attachment.id,
      action: "lesson_attachment.updated",
      oldValues: { fileName: before?.fileName, fileUrl: before?.fileUrl },
      newValues: { fileName: attachment.fileName, fileUrl: attachment.fileUrl },
    });

    return attachment;
  }
}
