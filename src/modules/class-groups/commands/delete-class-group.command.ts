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
  softDeleteClassGroup,
  countEnrollmentsForClassGroup,
} from "@/modules/class-groups/repositories/class-group.repository";
import {
  deleteClassGroupSchema,
  type DeleteClassGroupSchema,
} from "@/modules/class-groups/schemas/class-group.schema";
import type { ClassGroup } from "@/modules/class-groups/types";

export class SoftDeleteClassGroupCommand extends BaseCommand<DeleteClassGroupSchema, void> {
  private _existing: ClassGroup | null = null;

  async validate(): Promise<void> {
    const result = deleteClassGroupSchema.safeParse(this.input);
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

    const activeEnrollments = await countEnrollmentsForClassGroup(
      this.input.classGroupId
    );
    if (activeEnrollments > 0) {
      throw new BusinessRuleError(
        "Não é possível eliminar a turma porque existem matrículas ativas associadas"
      );
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.CLASS_GROUPS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await softDeleteClassGroup(
      this.input.classGroupId,
      this.context.organizationId
    );

    await auditService.log(this.context, {
      entity: "ClassGroup",
      entityId: this.input.classGroupId,
      action: "class_group.deleted",
      oldValues: {
        name: this._existing!.name,
        status: this._existing!.status,
        courseId: this._existing!.courseId,
      },
      newValues: { deleted: true },
    });
  }
}
