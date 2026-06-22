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
  findOrganizationRoleById,
  setOrganizationRoleStatus,
} from "@/modules/roles/repositories/organization-role.repository";

export class RestoreOrganizationRoleCommand extends BaseCommand<{ roleId: string }, void> {
  async validate(): Promise<void> {
    const role = await findOrganizationRoleById(this.input.roleId, this.context.organizationId);
    if (!role) throw new NotFoundError("Role", this.input.roleId);
    if (role.isSystem) {
      throw new BusinessRuleError("Uma role de sistema não pode ser restaurada");
    }
    if (role.status !== "ARCHIVED") {
      throw new BusinessRuleError("A role não está arquivada");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ORGANIZATION_ROLES_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const role = await setOrganizationRoleStatus(this.input.roleId, "ACTIVE");

    await auditService.log(this.context, {
      entity: "Role",
      entityId: role.id,
      action: "role.restored",
      oldValues: { status: "ARCHIVED" },
      newValues: { status: "ACTIVE" },
    });
  }
}
