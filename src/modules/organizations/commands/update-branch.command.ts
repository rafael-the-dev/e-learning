import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility, isSuperAdmin } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findBranchById,
  updateBranch,
} from "@/modules/organizations/repositories/branch.repository";
import { updateBranchSchema, type UpdateBranchSchema } from "@/modules/organizations/schemas/branch.schema";
import type { Branch } from "@prisma/client";

export class UpdateBranchCommand extends BaseCommand<
  UpdateBranchSchema & { organizationId: string; branchId: string },
  Branch
> {
  async validate(): Promise<void> {
    const result = updateBranchSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Validation failed", fieldErrors);
    }

    const branch = await findBranchById(this.input.organizationId, this.input.branchId);
    if (!branch) throw new NotFoundError("Branch", this.input.branchId);
  }

  async authorize(): Promise<void> {
    const superAdmin = await isSuperAdmin(this.context.userId);
    if (superAdmin) return;

    const permissions = await getUserPermissions(this.context.userId, this.input.organizationId);
    const ability = createAbility(permissions);
    if (!ability.can(PERMISSIONS.BRANCHES_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Branch> {
    const before = await findBranchById(this.input.organizationId, this.input.branchId);

    const updated = await updateBranch(this.input.organizationId, this.input.branchId, {
      name: this.input.name,
      code: this.input.code || null,
      address: this.input.address || null,
      phone: this.input.phone || null,
      email: this.input.email || null,
      isDefault: this.input.isDefault,
      status: this.input.status,
    });

    await auditService.log(
      { ...this.context, organizationId: this.input.organizationId },
      {
        entity: "Branch",
        entityId: this.input.branchId,
        action: "UPDATED",
        oldValues: before as Record<string, unknown>,
        newValues: updated as Record<string, unknown>,
      }
    );

    return updated;
  }
}
