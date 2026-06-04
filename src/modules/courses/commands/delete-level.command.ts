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
  deleteCourseLevel,
  countActiveSubjectsInLevel,
} from "@/modules/courses/repositories/level.repository";
import type { DeleteCourseLevelSchema } from "@/modules/courses/schemas/level.schema";

export class DeleteCourseLevelCommand extends BaseCommand<
  DeleteCourseLevelSchema,
  void
> {
  async validate(): Promise<void> {
    const level = await findLevelByIdInOrganization(
      this.input.levelId,
      this.context.organizationId
    );
    if (!level) throw new NotFoundError("Nível", this.input.levelId);

    const activeCount = await countActiveSubjectsInLevel(this.input.levelId);
    if (activeCount > 0) {
      throw new BusinessRuleError(
        "Não é possível eliminar um nível com disciplinas ativas. Archive as disciplinas primeiro."
      );
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
    await deleteCourseLevel(this.input.levelId);

    await auditService.log(this.context, {
      entity: "CourseLevel",
      entityId: this.input.levelId,
      action: "course_level.deleted",
      newValues: { deleted: true },
    });
  }
}
