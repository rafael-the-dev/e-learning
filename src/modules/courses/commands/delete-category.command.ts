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
  countCoursesUsingCategory,
  softDeleteCourseCategory,
} from "@/modules/courses/repositories/category.repository";
import type { DeleteCourseCategorySchema } from "@/modules/courses/schemas/category.schema";

export class SoftDeleteCourseCategoryCommand extends BaseCommand<
  DeleteCourseCategorySchema,
  void
> {
  async validate(): Promise<void> {
    const existing = await findCategoryByIdInOrganization(
      this.input.categoryId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Categoria", this.input.categoryId);

    const count = await countCoursesUsingCategory(this.input.categoryId);
    if (count > 0) {
      throw new BusinessRuleError(
        `Não é possível eliminar esta categoria. Existem ${count} curso(s) associado(s).`
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_CATEGORIES_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteCourseCategory(this.input.categoryId, this.context.userId);

    await auditService.log(this.context, {
      entity: "CourseCategory",
      entityId: this.input.categoryId,
      action: "course_category.deleted",
      newValues: { deletedBy: this.context.userId },
    });
  }
}
