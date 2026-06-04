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
  findLevelByIdInOrganization,
  updateCourseLevel,
  existsLevelNameInCourse,
} from "@/modules/courses/repositories/level.repository";
import {
  updateCourseLevelSchema,
  type UpdateCourseLevelSchema,
} from "@/modules/courses/schemas/level.schema";
import type { CourseLevel } from "@/modules/courses/types";

interface UpdateLevelInput extends UpdateCourseLevelSchema {
  levelId: string;
  courseId: string;
}

export class UpdateCourseLevelCommand extends BaseCommand<
  UpdateLevelInput,
  CourseLevel
> {
  private _existing: CourseLevel | null = null;

  async validate(): Promise<void> {
    const result = updateCourseLevelSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this._existing = await findLevelByIdInOrganization(
      this.input.levelId,
      this.context.organizationId
    );
    if (!this._existing) throw new NotFoundError("Nível", this.input.levelId);

    if (this.input.name && this.input.name !== this._existing.name) {
      const duplicate = await existsLevelNameInCourse(
        this._existing.courseId,
        this.input.name,
        this.input.levelId
      );
      if (duplicate) {
        throw new BusinessRuleError(
          `Já existe um nível com o nome "${this.input.name}" neste curso.`
        );
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.COURSE_LEVELS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<CourseLevel> {
    const level = await updateCourseLevel(this.input.levelId, {
      name: this.input.name,
      code: this.input.code !== undefined ? (this.input.code || null) : undefined,
      description: this.input.description !== undefined ? (this.input.description || null) : undefined,
      order: this.input.order ? parseInt(this.input.order, 10) : undefined,
      totalHours: this.input.totalHours !== undefined
        ? (this.input.totalHours ? parseInt(this.input.totalHours, 10) : null)
        : undefined,
      status: this.input.status,
    });

    await auditService.log(this.context, {
      entity: "CourseLevel",
      entityId: level.id,
      action: "course_level.updated",
      oldValues: this._existing
        ? { name: this._existing.name, status: this._existing.status }
        : null,
      newValues: { name: level.name, status: level.status },
    });

    return level;
  }
}
