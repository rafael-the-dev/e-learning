import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  createCourse,
  findCourseByCodes,
  findCourseByName,
} from "@/modules/courses/repositories/course.repository";
import { findCategoryByIdInOrganization } from "@/modules/courses/repositories/category.repository";
import {
  createCourseSchema,
  type CreateCourseSchema,
} from "@/modules/courses/schemas/course.schema";
import type { Course } from "@/modules/courses/types";

export class CreateCourseCommand extends BaseCommand<CreateCourseSchema, Course> {
  async validate(): Promise<void> {
    const result = createCourseSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    if (this.input.code) {
      const duplicate = await findCourseByCodes(
        this.context.organizationId,
        this.input.code
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe um curso com este código nesta organização"],
        });
      }
    }

    const duplicate = await findCourseByName(
      this.context.organizationId,
      this.input.name
    );
    if (duplicate) {
      throw new ValidationError("Dados inválidos", {
        name: ["Já existe um curso com este nome nesta organização"],
      });
    }

    if (this.input.categoryId) {
      const category = await findCategoryByIdInOrganization(
        this.input.categoryId,
        this.context.organizationId
      );
      if (!category) {
        throw new ValidationError("Dados inválidos", {
          categoryId: ["A categoria indicada não existe nesta organização"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSES_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Course> {
    const course = await createCourse({
      organizationId: this.context.organizationId,
      name: this.input.name,
      code: this.input.code || null,
      description: this.input.description || null,
      categoryId: this.input.categoryId || null,
      totalHours: this.input.totalHours ? parseInt(this.input.totalHours, 10) : null,
      price: this.input.price || null,
      status: this.input.status ?? "DRAFT",
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "Course",
      entityId: course.id,
      action: "course.created",
      newValues: {
        name: course.name,
        code: course.code,
        status: course.status,
        organizationId: this.context.organizationId,
      },
    });

    return course;
  }
}
