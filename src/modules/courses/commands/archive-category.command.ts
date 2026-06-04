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
  findCategoryByIdInOrganization,
  archiveCourseCategory,
} from "@/modules/courses/repositories/category.repository";
import type { ArchiveCourseCategorySchema } from "@/modules/courses/schemas/category.schema";
import type { CourseCategory } from "@/modules/courses/types";

export class ArchiveCourseCategoryCommand extends BaseCommand<
  ArchiveCourseCategorySchema,
  CourseCategory
> {
  async validate(): Promise<void> {
    const existing = await findCategoryByIdInOrganization(
      this.input.categoryId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Categoria", this.input.categoryId);
    if (existing.status === "ARCHIVED") {
      throw new BusinessRuleError("A categoria já está arquivada");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_CATEGORIES_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<CourseCategory> {
    const category = await archiveCourseCategory(
      this.input.categoryId,
      this.context.userId
    );

    await auditService.log(this.context, {
      entity: "CourseCategory",
      entityId: category.id,
      action: "course_category.archived",
      newValues: { status: "ARCHIVED" },
    });

    return category;
  }
}
