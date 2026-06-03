import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility, isSuperAdmin } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findOrganizationById } from "@/modules/organizations/repositories/organization.repository";
import { createBranch } from "@/modules/organizations/repositories/branch.repository";
import { createBranchSchema, type CreateBranchSchema } from "@/modules/organizations/schemas/branch.schema";
import type { Branch } from "@prisma/client";

export class CreateBranchCommand extends BaseCommand<
  CreateBranchSchema & { organizationId: string },
  Branch
> {
  async validate(): Promise<void> {
    const result = createBranchSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Validation failed", fieldErrors);
    }

    const org = await findOrganizationById(this.input.organizationId);
    if (!org) throw new NotFoundError("Organization", this.input.organizationId);
    if (org.status === "SUSPENDED" || org.status === "CANCELLED") {
      throw new ValidationError("Cannot add branches to an inactive organization");
    }
  }

  async authorize(): Promise<void> {
    const superAdmin = await isSuperAdmin(this.context.userId);
    if (superAdmin) return;

    const permissions = await getUserPermissions(this.context.userId, this.input.organizationId);
    const ability = createAbility(permissions);
    if (!ability.can(PERMISSIONS.BRANCHES_CREATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Branch> {
    const branch = await createBranch({
      organizationId: this.input.organizationId,
      name: this.input.name,
      code: this.input.code || undefined,
      address: this.input.address || undefined,
      phone: this.input.phone || undefined,
      email: this.input.email || undefined,
      isDefault: this.input.isDefault ?? false,
    });

    await auditService.log(
      { ...this.context, organizationId: this.input.organizationId },
      {
        entity: "Branch",
        entityId: branch.id,
        action: "CREATED",
        newValues: { name: branch.name, organizationId: this.input.organizationId },
      }
    );

    return branch;
  }
}
