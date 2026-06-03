import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findUserInOrganization,
  updateOrgUser,
} from "@/modules/users/repositories/user.repository";
import {
  updateUserSchema,
  type UpdateUserSchema,
} from "@/modules/users/schemas/user.schema";
import type { OrgUser } from "@/modules/users/types";

interface UpdateOrgUserInput extends UpdateUserSchema {
  userId: string;
}

export class UpdateOrganizationUserCommand extends BaseCommand<
  UpdateOrgUserInput,
  OrgUser
> {
  async validate(): Promise<void> {
    const result = updateUserSchema.safeParse({
      name: this.input.name,
      phone: this.input.phone,
    });
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const user = await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    );
    if (!user) throw new NotFoundError("Utilizador", this.input.userId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.USERS_UPDATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<OrgUser> {
    const before = await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    );

    await updateOrgUser(this.input.userId, {
      name: this.input.name,
      phone: this.input.phone ?? null,
    });

    await auditService.log(this.context, {
      entity: "User",
      entityId: this.input.userId,
      action: "UPDATED",
      oldValues: { name: before?.name, phone: before?.phone },
      newValues: { name: this.input.name, phone: this.input.phone },
    });

    return (await findUserInOrganization(
      this.input.userId,
      this.context.organizationId
    ))!;
  }
}
