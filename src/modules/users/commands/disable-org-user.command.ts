import { BaseCommand, AuthorizationError, ValidationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findUserInOrganization,
  setUserActiveStatus,
  countOrgAdmins,
} from "@/modules/users/repositories/user.repository";
import type { DisableUserSchema } from "@/modules/users/schemas/user.schema";

export class DisableOrganizationUserCommand extends BaseCommand<
  DisableUserSchema,
  void
> {
  async validate(): Promise<void> {
    const user = await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    );
    if (!user) throw new NotFoundError("Utilizador", this.input.userId);
    if (!user.isActive) {
      throw new ValidationError("O utilizador já se encontra desativado");
    }

    // Prevent disabling the last active ORG_ADMIN
    const isOrgAdmin = user.roles.some((r) => r.name === "ORG_ADMIN");
    if (isOrgAdmin) {
      const adminCount = await countOrgAdmins(this.context.organizationId);
      if (adminCount <= 1) {
        throw new BusinessRuleError(
          "Não é possível desativar o último administrador da organização"
        );
      }
    }

    // Prevent self-disablement if actor is the last ORG_ADMIN
    if (this.input.userId === this.context.userId) {
      const adminCount = await countOrgAdmins(this.context.organizationId);
      if (adminCount <= 1) {
        throw new BusinessRuleError(
          "Não é possível desativar a sua própria conta — é o último administrador"
        );
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.USERS_DISABLE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await setUserActiveStatus(this.input.userId, false);

    await auditService.log(this.context, {
      entity: "User",
      entityId: this.input.userId,
      action: "STATUS_CHANGED",
      newValues: { isActive: false },
    });
  }
}
