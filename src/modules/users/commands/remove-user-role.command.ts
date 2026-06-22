import { BaseCommand, AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findUserInOrganization,
  deleteUserRolesInOrg,
  countOrgAdmins,
} from "@/modules/users/repositories/user.repository";

export interface RemoveUserRoleInput {
  userId: string;
}

export class RemoveUserRoleCommand extends BaseCommand<RemoveUserRoleInput, void> {
  async validate(): Promise<void> {
    const user = await findUserInOrganization(this.input.userId, this.context.organizationId);
    if (!user) throw new NotFoundError("Utilizador", this.input.userId);

    const isOrgAdmin = user.roles.some((r) => r.name === "ORG_ADMIN");
    if (isOrgAdmin) {
      const adminCount = await countOrgAdmins(this.context.organizationId);
      if (adminCount <= 1) {
        throw new BusinessRuleError(
          "Não é possível remover o papel do último administrador da organização"
        );
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ROLES_ASSIGN)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const before = await findUserInOrganization(this.input.userId, this.context.organizationId);
    const previousRoles = before?.roles ?? [];

    await deleteUserRolesInOrg(this.input.userId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "User",
      entityId: this.input.userId,
      action: "UPDATED",
      oldValues: { roles: previousRoles.map((r) => r.name) },
      newValues: { roles: [] },
    });

    for (const role of previousRoles) {
      await auditService.log(this.context, {
        entity: "Role",
        entityId: role.id,
        action: "role.user.removed",
        oldValues: { userId: this.input.userId },
      });
    }
  }
}
