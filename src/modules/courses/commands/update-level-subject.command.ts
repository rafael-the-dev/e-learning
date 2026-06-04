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
  findLevelSubjectById,
  updateLevelSubject,
  isOrderTakenInLevel,
} from "@/modules/courses/repositories/level-subject.repository";
import {
  updateLevelSubjectSchema,
  type UpdateLevelSubjectSchema,
} from "@/modules/courses/schemas/level-subject.schema";
import type { LevelSubject } from "@/modules/courses/types";

interface UpdateLevelSubjectInput extends UpdateLevelSubjectSchema {
  levelSubjectId: string;
}

export class UpdateLevelSubjectCommand extends BaseCommand<UpdateLevelSubjectInput, LevelSubject> {
  private _existing: LevelSubject | null = null;

  async validate(): Promise<void> {
    const result = updateLevelSubjectSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    this._existing = await findLevelSubjectById(
      this.input.levelSubjectId,
      this.context.organizationId
    );
    if (!this._existing) throw new NotFoundError("Associação", this.input.levelSubjectId);

    if (this.input.order !== undefined) {
      const orderTaken = await isOrderTakenInLevel(
        this._existing.courseLevelId,
        this.input.order,
        this.input.levelSubjectId
      );
      if (orderTaken) {
        throw new ValidationError("Dados inválidos", {
          order: ["Esta posição já está ocupada neste nível"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.LEVEL_SUBJECTS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<LevelSubject> {
    const levelSubject = await updateLevelSubject(this.input.levelSubjectId, this.context.organizationId, {
      order: this.input.order,
      workloadHours: this.input.workloadHours,
      minimumPassingGrade: this.input.minimumPassingGrade,
      isRequired: this.input.isRequired,
      status: this.input.status,
    });

    await auditService.log(this.context, {
      entity: "LevelSubject",
      entityId: levelSubject.id,
      action: "level_subject.updated",
      oldValues: this._existing
        ? { status: this._existing.status, order: this._existing.order }
        : null,
      newValues: { status: levelSubject.status, order: levelSubject.order },
    });

    return levelSubject;
  }
}
