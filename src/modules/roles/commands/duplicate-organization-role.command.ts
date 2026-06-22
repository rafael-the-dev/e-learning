import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findOrganizationRoleById,
  createOrganizationRole,
  copyRolePermissions,
} from "@/modules/roles/repositories/organization-role.repository";
import { validateRoleCodeUnique } from "@/modules/roles/services/organization-role.service";
import {
  duplicateOrganizationRoleSchema,
  type DuplicateOrganizationRoleSchema,
} from "@/modules/roles/schemas/role.schema";

export class DuplicateOrganizationRoleCommand extends BaseCommand<DuplicateOrganizationRoleSchema, {
  id: string;
  name: string;
  code: string | null;
}> {
  async validate(): Promise<void> {
    const result = duplicateOrganizationRoleSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        (fieldErrors[key] ??= []).push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const source = await findOrganizationRoleById(this.input.sourceRoleId, this.context.organizationId);
    if (!source) throw new NotFoundError("Role", this.input.sourceRoleId);

    const codeCheck = await validateRoleCodeUnique(this.input.code, this.context.organizationId);
    if (!codeCheck.valid) {
      throw new ValidationError("Dados inválidos", {
        code: [
          codeCheck.reason === "RESERVED"
            ? "Este código está reservado para uma role de sistema"
            : "Já existe uma role com este código nesta organização",
        ],
      });
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ORGANIZATION_ROLES_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute() {
    const role = await createOrganizationRole({
      organizationId: this.context.organizationId,
      name: this.input.name,
      code: this.input.code,
      description: null,
    });

    const permissionCount = await copyRolePermissions(this.input.sourceRoleId, role.id);

    await auditService.log(this.context, {
      entity: "Role",
      entityId: role.id,
      action: "role.duplicated",
      newValues: {
        name: role.name,
        code: role.code,
        duplicatedFrom: this.input.sourceRoleId,
        permissionCount,
      },
    });

    return { id: role.id, name: role.name, code: role.code };
  }
}
