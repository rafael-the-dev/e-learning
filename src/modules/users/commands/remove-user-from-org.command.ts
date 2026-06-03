import { BaseCommand, AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findUserInOrganization,
  deleteUserRolesInOrg,
  deleteUserOrganizationLink,
  countOrgAdmins,
} from "@/modules/users/repositories/user.repository";
import type { RemoveUserSchema } from "@/modules/users/schemas/user.schema";
import { getDb } from "@/server/db";

export class RemoveUserFromOrganizationCommand extends BaseCommand<
  RemoveUserSchema,
  void
> {
  async validate(): Promise<void> {
    const user = await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    );
    if (!user) throw new NotFoundError("Utilizador", this.input.userId);

    // Prevent removing last ORG_ADMIN (covers self-removal too)
    const isOrgAdmin = user.roles.some((r) => r.name === "ORG_ADMIN");
    if (isOrgAdmin) {
      const adminCount = await countOrgAdmins(this.context.organizationId);
      if (adminCount <= 1) {
        throw new BusinessRuleError(
          "Não é possível remover o último administrador da organização"
        );
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.USERS_DELETE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const db = await getDb();

    // Use a transaction: remove roles then membership atomically
    await db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: this.input.userId, organizationId: this.context.organizationId },
      });
      await tx.userOrganization.deleteMany({
        where: { userId: this.input.userId, organizationId: this.context.organizationId },
      });
    });

    await auditService.log(this.context, {
      entity: "User",
      entityId: this.input.userId,
      action: "DELETED",
      newValues: { organizationId: this.context.organizationId },
    });
  }
}
