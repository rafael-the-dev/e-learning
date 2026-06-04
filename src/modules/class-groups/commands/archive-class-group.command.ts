import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findClassGroupById,
  archiveClassGroup,
} from "@/modules/class-groups/repositories/class-group.repository";
import {
  archiveClassGroupSchema,
  type ArchiveClassGroupSchema,
} from "@/modules/class-groups/schemas/class-group.schema";
import type { ClassGroup } from "@/modules/class-groups/types";

export class ArchiveClassGroupCommand extends BaseCommand<ArchiveClassGroupSchema, void> {
  private _existing: ClassGroup | null = null;

  async validate(): Promise<void> {
    const result = archiveClassGroupSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findClassGroupById(
      this.input.classGroupId,
      this.context.organizationId
    );
    if (!existing) throw new NotFoundError("Turma", this.input.classGroupId);
    this._existing = existing;

    if (existing.status === "ARCHIVED") {
      throw new BusinessRuleError("A turma já está arquivada");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_GROUPS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveClassGroup(
      this.input.classGroupId,
      this.context.organizationId
    );

    await auditService.log(this.context, {
      entity: "ClassGroup",
      entityId: this.input.classGroupId,
      action: "class_group.archived",
      oldValues: { status: this._existing!.status },
      newValues: { status: "ARCHIVED" },
    });
  }
}
