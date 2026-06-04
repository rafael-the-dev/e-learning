import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findCourseByIdInOrganization,
  updateCourse,
  findCourseByCodes,
  findCourseByName,
} from "@/modules/courses/repositories/course.repository";
import { findCategoryByIdInOrganization } from "@/modules/courses/repositories/category.repository";
import {
  updateCourseSchema,
  type UpdateCourseSchema,
} from "@/modules/courses/schemas/course.schema";
import type { Course } from "@/modules/courses/types";

interface UpdateCourseInput extends UpdateCourseSchema {
  courseId: string;
}

export class UpdateCourseCommand extends BaseCommand<UpdateCourseInput, Course> {
  async validate(): Promise<void> {
    const result = updateCourseSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Curso", this.input.courseId);

    if (this.input.code) {
      const duplicate = await findCourseByCodes(
        this.context.organizationId,
        this.input.code,
        this.input.courseId
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          code: ["Já existe um curso com este código nesta organização"],
        });
      }
    }

    if (this.input.name && this.input.name !== existing.name) {
      const duplicate = await findCourseByName(
        this.context.organizationId,
        this.input.name,
        this.input.courseId
      );
      if (duplicate) {
        throw new ValidationError("Dados inválidos", {
          name: ["Já existe um curso com este nome nesta organização"],
        });
      }
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
    if (!createAbility(perms).can(PERMISSIONS.COURSES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Course> {
    const old = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );

    const course = await updateCourse(
      this.input.courseId,
      this.context.organizationId,
      {
        name: this.input.name,
        code: this.input.code !== undefined ? (this.input.code || null) : undefined,
        description: this.input.description !== undefined ? (this.input.description || null) : undefined,
        categoryId: this.input.categoryId !== undefined ? (this.input.categoryId || null) : undefined,
        totalHours: this.input.totalHours !== undefined
          ? (this.input.totalHours ? parseInt(this.input.totalHours, 10) : null)
          : undefined,
        price: this.input.price !== undefined ? (this.input.price || null) : undefined,
        status: this.input.status,
        updatedBy: this.context.userId,
      }
    );

    await auditService.log(this.context, {
      entity: "Course",
      entityId: course.id,
      action: "course.updated",
      oldValues: old ? { name: old.name, status: old.status } : null,
      newValues: { name: course.name, status: course.status },
    });

    return course;
  }
}
