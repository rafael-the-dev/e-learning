import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createCourseCategory,
  existsCategoryNameInOrganization,
} from "@/modules/courses/repositories/category.repository";
import {
  createCourseCategorySchema,
  type CreateCourseCategorySchema,
} from "@/modules/courses/schemas/category.schema";
import type { CourseCategory } from "@/modules/courses/types";

export class CreateCourseCategoryCommand extends BaseCommand<
  CreateCourseCategorySchema,
  CourseCategory
> {
  async validate(): Promise<void> {
    const result = createCourseCategorySchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const exists = await existsCategoryNameInOrganization(
      this.context.organizationId,
      this.input.name
    );
    if (exists) {
      throw new ValidationError("Dados inválidos", {
        name: ["Já existe uma categoria com este nome nesta organização"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_CATEGORIES_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<CourseCategory> {
    const category = await createCourseCategory({
      organizationId: this.context.organizationId,
      name: this.input.name,
      description: this.input.description || null,
      status: this.input.status ?? "ACTIVE",
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "CourseCategory",
      entityId: category.id,
      action: "course_category.created",
      newValues: {
        name: category.name,
        status: category.status,
        organizationId: this.context.organizationId,
      },
    });

    return category;
  }
}
