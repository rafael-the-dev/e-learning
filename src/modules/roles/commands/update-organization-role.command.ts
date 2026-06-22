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
  findOrganizationRoleById,
  updateOrganizationRole,
} from "@/modules/roles/repositories/organization-role.repository";
import {
  updateOrganizationRoleSchema,
  type UpdateOrganizationRoleSchema,
} from "@/modules/roles/schemas/role.schema";

type Input = UpdateOrganizationRoleSchema & { roleId: string };

export class UpdateOrganizationRoleCommand extends BaseCommand<Input, void> {
  private before: Awaited<ReturnType<typeof findOrganizationRoleById>> = null;

  async validate(): Promise<void> {
    const result = updateOrganizationRoleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const role = await findOrganizationRoleById(this.input.roleId, this.context.organizationId);
    if (!role) throw new NotFoundError("Role", this.input.roleId);
    if (role.isSystem) {
      throw new BusinessRuleError("Não é possível editar uma role de sistema");
    }
    if (role.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível editar uma role arquivada");
    }
    this.before = role;
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ORGANIZATION_ROLES_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const before = this.before;
    const role = await updateOrganizationRole(this.input.roleId, {
      name: this.input.name,
      description: this.input.description ?? null,
    });

    await auditService.log(this.context, {
      entity: "Role",
      entityId: role.id,
      action: "role.updated",
      oldValues: { name: before?.name, description: before?.description },
      newValues: { name: role.name, description: role.description },
    });
  }
}
