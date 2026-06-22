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
import { getDb } from "@/server/db";
import { findOrganizationRoleById } from "@/modules/roles/repositories/organization-role.repository";
import { findRolePermissionIds } from "@/modules/roles/repositories/permission.repository";
import { diffPermissions } from "@/modules/roles/services/permission-matrix.service";
import {
  updateRolePermissionsSchema,
  type UpdateRolePermissionsSchema,
} from "@/modules/roles/schemas/role.schema";

export class UpdateRolePermissionsCommand extends BaseCommand<UpdateRolePermissionsSchema, void> {
  async validate(): Promise<void> {
    const result = updateRolePermissionsSchema.safeParse(this.input);
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
      throw new BusinessRuleError("As permissões de uma role de sistema não podem ser alteradas");
    }
    if (role.status === "ARCHIVED") {
      throw new BusinessRuleError("Não é possível alterar as permissões de uma role arquivada");
    }

    const uniqueIds = new Set(this.input.permissionIds);
    if (uniqueIds.size !== this.input.permissionIds.length) {
      throw new ValidationError("Dados inválidos", {
        permissionIds: ["A lista de permissões contém duplicados"],
      });
    }

    if (uniqueIds.size > 0) {
      const db = await getDb();
      const found = await db.permission.count({ where: { id: { in: [...uniqueIds] } } });
      if (found !== uniqueIds.size) {
        throw new ValidationError("Dados inválidos", {
          permissionIds: ["Uma ou mais permissões indicadas não existem"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ORGANIZATION_ROLES_MANAGE_PERMISSIONS)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    const before = await findRolePermissionIds(this.input.roleId);
    const after = this.input.permissionIds;

    const db = await getDb();
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId: this.input.roleId } }),
      ...(after.length
        ? [
            db.rolePermission.createMany({
              data: after.map((permissionId) => ({ roleId: this.input.roleId, permissionId })),
            }),
          ]
        : []),
    ]);

    const { added, removed } = diffPermissions(before, after);

    await auditService.log(this.context, {
      entity: "Role",
      entityId: this.input.roleId,
      action: "role.permissions.updated",
      oldValues: { permissions: before },
      newValues: { permissions: after, added, removed },
    });
  }
}
