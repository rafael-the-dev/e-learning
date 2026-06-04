import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findLevelsByCourse,
  reorderCourseLevels,
} from "@/modules/courses/repositories/level.repository";
import { findCourseByIdInOrganization } from "@/modules/courses/repositories/course.repository";
import {
  reorderCourseLevelsSchema,
  type ReorderCourseLevelsSchema,
} from "@/modules/courses/schemas/level.schema";

export class ReorderCourseLevelsCommand extends BaseCommand<
  ReorderCourseLevelsSchema,
  void
> {
  async validate(): Promise<void> {
    const result = reorderCourseLevelsSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const seenIds = new Set<string>();
    for (const id of this.input.levelIds) {
      if (seenIds.has(id)) {
        throw new BusinessRuleError(
          "A lista de níveis contém IDs duplicados."
        );
      }
      seenIds.add(id);
    }

    const course = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );
    if (!course) throw new NotFoundError("Curso", this.input.courseId);

    const existingLevels = await findLevelsByCourse(
      this.input.courseId,
      this.context.organizationId
    );
    const existingIds = new Set(existingLevels.map((l) => l.id));

    for (const id of this.input.levelIds) {
      if (!existingIds.has(id)) {
        throw new BusinessRuleError(
          "Um ou mais níveis fornecidos não pertencem a este curso."
        );
      }
    }

    if (this.input.levelIds.length !== existingLevels.length) {
      throw new BusinessRuleError(
        "A lista de níveis deve incluir todos os níveis do curso."
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_LEVELS_REORDER)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await reorderCourseLevels(this.input.levelIds);

    await auditService.log(this.context, {
      entity: "CourseLevel",
      entityId: this.input.courseId,
      action: "course_level.reordered",
      newValues: { courseId: this.input.courseId, levelIds: this.input.levelIds },
    });
  }
}
