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
  findCourseByIdInOrganization,
  archiveCourse,
} from "@/modules/courses/repositories/course.repository";
import type { ArchiveCourseSchema } from "@/modules/courses/schemas/course.schema";

export class ArchiveCourseCommand extends BaseCommand<ArchiveCourseSchema, void> {
  async validate(): Promise<void> {
    const course = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );
    if (!course) throw new NotFoundError("Curso", this.input.courseId);
    if (course.status === "ARCHIVED") {
      throw new BusinessRuleError("O curso já está arquivado");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSES_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const course = await archiveCourse(
      this.input.courseId,
      this.context.organizationId,
      this.context.userId
    );

    await auditService.log(this.context, {
      entity: "Course",
      entityId: course.id,
      action: "course.archived",
      newValues: { status: "ARCHIVED" },
    });
  }
}
