import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findUserInOrganization,
  findRoleById,
  deleteUserRolesInOrg,
  createUserRoleLink,
} from "@/modules/users/repositories/user.repository";
import type { AssignRoleSchema } from "@/modules/users/schemas/user.schema";

export class AssignUserRoleCommand extends BaseCommand<AssignRoleSchema, void> {
  async validate(): Promise<void> {
    const user = await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    );
    if (!user) throw new NotFoundError("Utilizador", this.input.userId);

    const role = await findRoleById(this.input.roleId);
    if (!role) {
      throw new ValidationError("Dados inválidos", {
        roleId: ["Papel não encontrado"],
      });
    }

    // ORG_ADMIN cannot assign SUPER_ADMIN
    if (role.name === "SUPER_ADMIN") {
      throw new ValidationError("Dados inválidos", {
        roleId: ["Não é permitido atribuir o papel de Super Admin"],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.ROLES_ASSIGN)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const before = await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    );
    const previousRoles = before?.roles.map((r) => r.name) ?? [];

    // Replace all existing org roles with the new one
    await deleteUserRolesInOrg(this.input.userId, this.context.organizationId);
    await createUserRoleLink({
      userId: this.input.userId,
      roleId: this.input.roleId,
      organizationId: this.context.organizationId,
      assignedBy: this.context.userId,
    });

    const role = await findRoleById(this.input.roleId);

    await auditService.log(this.context, {
      entity: "User",
      entityId: this.input.userId,
      action: "UPDATED",
      oldValues: { roles: previousRoles },
      newValues: { roles: [role?.name] },
    });
  }
}
