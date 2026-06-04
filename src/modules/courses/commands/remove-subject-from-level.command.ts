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
  deleteLevelSubject,
} from "@/modules/courses/repositories/level-subject.repository";
import {
  removeLevelSubjectSchema,
  type RemoveLevelSubjectSchema,
} from "@/modules/courses/schemas/level-subject.schema";
import type { LevelSubject } from "@/modules/courses/types";

export class RemoveSubjectFromLevelCommand extends BaseCommand<RemoveLevelSubjectSchema, void> {
  private _existing: LevelSubject | null = null;

  async validate(): Promise<void> {
    const result = removeLevelSubjectSchema.safeParse(this.input);
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
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.LEVEL_SUBJECTS_REMOVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await deleteLevelSubject(this.input.levelSubjectId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "LevelSubject",
      entityId: this.input.levelSubjectId,
      action: "level_subject.removed",
      oldValues: {
        courseLevelId: this._existing!.courseLevelId,
        subjectId: this._existing!.subjectId,
        subjectName: this._existing!.subjectName ?? null,
        order: this._existing!.order,
      },
      newValues: { removed: true },
    });
  }
}
