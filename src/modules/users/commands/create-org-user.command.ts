import bcrypt from "bcryptjs";
import { BaseCommand, AuthorizationError, ValidationError, BusinessRuleError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findUserByEmail,
  createOrgUser,
  createUserOrganizationLink,
  createUserRoleLink,
  findUserInOrganization,
  findRoleById,
} from "@/modules/users/repositories/user.repository";
import {
  createUserSchema,
  type CreateUserSchema,
} from "@/modules/users/schemas/user.schema";
import type { OrgUser } from "@/modules/users/types";

export class CreateOrganizationUserCommand extends BaseCommand<
  CreateUserSchema,
  OrgUser
> {
  async validate(): Promise<void> {
    const result = createUserSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const existing = await findUserByEmail(this.input.email);
    if (existing) {
      throw new ValidationError("Dados inválidos", {
        email: ["Este endereço de e-mail já está em uso"],
      });
    }

    const role = await findRoleById(this.input.roleId);
    if (!role || (!role.isSystem && role.organizationId !== this.context.organizationId)) {
      throw new ValidationError("Dados inválidos", {
        roleId: ["Papel não encontrado"],
      });
    }
    if (role.name === "SUPER_ADMIN") {
      throw new ValidationError("Dados inválidos", {
        roleId: ["Não é permitido atribuir o papel de Super Admin"],
      });
    }
    if (role.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível atribuir um papel arquivado");
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.USERS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<OrgUser> {
    const passwordHash = await bcrypt.hash(this.input.password, 12);

    const user = await createOrgUser({
      name: this.input.name,
      email: this.input.email,
      phone: this.input.phone,
      passwordHash,
    });

    await createUserOrganizationLink({
      userId: user.id,
      organizationId: this.context.organizationId,
    });

    await createUserRoleLink({
      userId: user.id,
      roleId: this.input.roleId,
      organizationId: this.context.organizationId,
      assignedBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "User",
      entityId: user.id,
      action: "CREATED",
      newValues: {
        name: user.name,
        email: user.email,
        organizationId: this.context.organizationId,
      },
    });

    return (await findUserInOrganization(user.id, this.context.organizationId))!;
  }
}
