import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findUserInOrganization,
  setUserActiveStatus,
} from "@/modules/users/repositories/user.repository";
import type { DisableUserSchema } from "@/modules/users/schemas/user.schema";

export class EnableOrganizationUserCommand extends BaseCommand<DisableUserSchema, void> {
  async validate(): Promise<void> {
    const user = await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    );
    if (!user) throw new NotFoundError("Utilizador", this.input.userId);
    if (user.isActive) {
      throw new ValidationError("O utilizador já se encontra ativo");
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
    await setUserActiveStatus(this.input.userId, true);

    await auditService.log(this.context, {
      entity: "User",
      entityId: this.input.userId,
      action: "STATUS_CHANGED",
      newValues: { isActive: true },
    });
  }
}
