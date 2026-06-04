import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findLevelSubjectsByLevel,
  reorderLevelSubjects,
} from "@/modules/courses/repositories/level-subject.repository";
import { findLevelByIdInOrganization } from "@/modules/courses/repositories/level.repository";
import {
  reorderLevelSubjectsSchema,
  type ReorderLevelSubjectsSchema,
} from "@/modules/courses/schemas/level-subject.schema";

interface ReorderLevelSubjectsInput extends ReorderLevelSubjectsSchema {
  courseLevelId: string;
}

export class ReorderLevelSubjectsCommand extends BaseCommand<ReorderLevelSubjectsInput, void> {
  async validate(): Promise<void> {
    const result = reorderLevelSubjectsSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const level = await findLevelByIdInOrganization(
      this.input.courseLevelId,
      this.context.organizationId
    );
    if (!level) throw new NotFoundError("Nível", this.input.courseLevelId);

    const existing = await findLevelSubjectsByLevel(
      this.input.courseLevelId,
      this.context.organizationId
    );
    const existingIds = new Set(existing.map((ls) => ls.id));
    const inputIds = this.input.items.map((i) => i.id);

    if (inputIds.length !== existingIds.size) {
      throw new ValidationError("Dados inválidos", {
        items: ["A reordenação deve incluir todas as disciplinas do nível"],
      });
    }

    const allBelong = inputIds.every((id) => existingIds.has(id));
    if (!allBelong) {
      throw new ValidationError("Dados inválidos", {
        items: ["Alguns registos não pertencem a este nível"],
      });
    }

    const hasDuplicates = new Set(inputIds).size !== inputIds.length;
    if (hasDuplicates) {
      throw new ValidationError("Dados inválidos", {
        items: ["Existem IDs duplicados na reordenação"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.LEVEL_SUBJECTS_REORDER)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await reorderLevelSubjects(this.context.organizationId, this.input.items);

    await auditService.log(this.context, {
      entity: "LevelSubject",
      entityId: this.input.courseLevelId,
      action: "level_subject.reordered",
      newValues: { courseLevelId: this.input.courseLevelId, count: this.input.items.length },
    });
  }
}
