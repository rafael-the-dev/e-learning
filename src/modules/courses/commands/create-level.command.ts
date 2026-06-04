import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createCourseLevel } from "@/modules/courses/repositories/level.repository";
import { findCourseByIdInOrganization } from "@/modules/courses/repositories/course.repository";
import {
  createCourseLevelSchema,
  type CreateCourseLevelSchema,
} from "@/modules/courses/schemas/level.schema";
import type { CourseLevel } from "@/modules/courses/types";

// courseId is injected server-side from the URL param, not from the client schema
interface CreateLevelInput extends CreateCourseLevelSchema {
  courseId: string;
}

export class CreateCourseLevelCommand extends BaseCommand<
  CreateLevelInput,
  CourseLevel
> {
  async validate(): Promise<void> {
    const result = createCourseLevelSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const course = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );
    if (!course) throw new NotFoundError("Curso", this.input.courseId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_LEVELS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<CourseLevel> {
    const level = await createCourseLevel({
      courseId: this.input.courseId,
      name: this.input.name,
      code: this.input.code || null,
      description: this.input.description || null,
      order: this.input.order ? parseInt(this.input.order, 10) : undefined,
      totalHours: this.input.totalHours
        ? parseInt(this.input.totalHours, 10)
        : null,
    });

    await auditService.log(this.context, {
      entity: "CourseLevel",
      entityId: level.id,
      action: "course_level.created",
      newValues: {
        name: level.name,
        courseId: level.courseId,
        organizationId: this.context.organizationId,
      },
    });

    return level;
  }
}
