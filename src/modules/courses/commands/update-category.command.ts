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
  findCategoryByIdInOrganization,
  updateCourseCategory,
  existsCategoryNameInOrganization,
} from "@/modules/courses/repositories/category.repository";
import {
  updateCourseCategorySchema,
  type UpdateCourseCategorySchema,
} from "@/modules/courses/schemas/category.schema";
import type { CourseCategory } from "@/modules/courses/types";

interface UpdateCategoryInput extends UpdateCourseCategorySchema {
  categoryId: string;
}

export class UpdateCourseCategoryCommand extends BaseCommand<
  UpdateCategoryInput,
  CourseCategory
> {
  private _existing: CourseCategory | null = null;

  async validate(): Promise<void> {
    const result = updateCourseCategorySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this._existing = await findCategoryByIdInOrganization(
      this.input.categoryId,
      this.context.organizationId
    );
    if (!this._existing) throw new NotFoundError("Categoria", this.input.categoryId);

    if (this.input.name !== this._existing.name) {
      const exists = await existsCategoryNameInOrganization(
        this.context.organizationId,
        this.input.name,
        this.input.categoryId
      );
      if (exists) {
        throw new ValidationError("Dados inválidos", {
          name: ["Já existe uma categoria com este nome nesta organização"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_CATEGORIES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<CourseCategory> {
    const category = await updateCourseCategory(this.input.categoryId, this.context.organizationId, {
      name: this.input.name,
      description:
        this.input.description !== undefined
          ? this.input.description || null
          : undefined,
      status: this.input.status,
      updatedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "CourseCategory",
      entityId: category.id,
      action: "course_category.updated",
      oldValues: this._existing
        ? { name: this._existing.name, status: this._existing.status }
        : null,
      newValues: { name: category.name, status: category.status },
    });

    return category;
  }
}
