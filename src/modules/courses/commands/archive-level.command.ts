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
  findLevelByIdInOrganization,
  archiveCourseLevel,
} from "@/modules/courses/repositories/level.repository";
import type { ArchiveCourseLevelSchema } from "@/modules/courses/schemas/level.schema";

export class ArchiveCourseLevelCommand extends BaseCommand<
  ArchiveCourseLevelSchema,
  void
> {
  async validate(): Promise<void> {
    const level = await findLevelByIdInOrganization(
      this.input.levelId,
      this.context.organizationId
    );
    if (!level) throw new NotFoundError("Nível", this.input.levelId);
    if (level.status === "ARCHIVED") {
      throw new BusinessRuleError("O nível já está arquivado");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_LEVELS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveCourseLevel(this.input.levelId);

    await auditService.log(this.context, {
      entity: "CourseLevel",
      entityId: this.input.levelId,
      action: "course_level.archived",
      newValues: { status: "ARCHIVED" },
    });
  }
}
