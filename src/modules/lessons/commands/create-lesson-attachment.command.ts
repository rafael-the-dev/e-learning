import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findLessonByIdInOrganization } from "@/modules/lessons/repositories/lesson.repository";
import { createLessonAttachment } from "@/modules/lessons/repositories/lesson-attachment.repository";
import {
  createLessonAttachmentSchema,
  type CreateLessonAttachmentSchema,
} from "@/modules/lessons/schemas/lesson-attachment.schema";
import type { LessonAttachment } from "@/modules/lessons/types";

export class CreateLessonAttachmentCommand extends BaseCommand<
  CreateLessonAttachmentSchema,
  LessonAttachment
> {
  async validate(): Promise<void> {
    const result = createLessonAttachmentSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const lesson = await findLessonByIdInOrganization(
      this.input.lessonId,
      this.context.organizationId
    );
    if (!lesson) throw new NotFoundError("Lição", this.input.lessonId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.LESSON_ATTACHMENTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<LessonAttachment> {
    const attachment = await createLessonAttachment({
      organizationId: this.context.organizationId,
      lessonId: this.input.lessonId,
      fileName: this.input.fileName,
      fileUrl: this.input.fileUrl,
      fileType: this.input.fileType ?? "OTHER",
      fileSize: this.input.fileSize ?? null,
      isDownloadable: this.input.isDownloadable ?? true,
    });

    await auditService.log(this.context, {
      entity: "LessonAttachment",
      entityId: attachment.id,
      action: "lesson_attachment.created",
      newValues: { lessonId: attachment.lessonId, fileName: attachment.fileName },
    });

    return attachment;
  }
}
