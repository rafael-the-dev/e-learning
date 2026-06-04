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
  softDeleteCourse,
  countEnrollmentsForCourse,
} from "@/modules/courses/repositories/course.repository";
import type { DeleteCourseSchema } from "@/modules/courses/schemas/course.schema";

export class SoftDeleteCourseCommand extends BaseCommand<DeleteCourseSchema, void> {
  async validate(): Promise<void> {
    const course = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );
    if (!course) throw new NotFoundError("Curso", this.input.courseId);

    if (course.status === "ACTIVE") {
      throw new BusinessRuleError(
        "Não é possível eliminar um curso ativo. Archive-o primeiro."
      );
    }

    const enrollmentCount = await countEnrollmentsForCourse(this.input.courseId);
    if (enrollmentCount > 0) {
      throw new BusinessRuleError(
        "Não é possível eliminar um curso com matrículas associadas."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSES_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteCourse(
      this.input.courseId,
      this.context.organizationId,
      this.context.userId
    );

    await auditService.log(this.context, {
      entity: "Course",
      entityId: this.input.courseId,
      action: "course.deleted",
      newValues: { deletedAt: new Date().toISOString() },
    });
  }
}
