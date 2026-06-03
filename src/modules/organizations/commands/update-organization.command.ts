import { BaseCommand, AuthorizationError, ValidationError, NotFoundError } from "@/shared/lib/command";
import { getUserPermissions, createAbility, isSuperAdmin } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findOrganizationById,
  updateOrganization,
} from "@/modules/organizations/repositories/organization.repository";
import { updateOrganizationSchema, type UpdateOrganizationSchema } from "@/modules/organizations/schemas/organization.schema";
import type { Organization } from "@prisma/client";

export class UpdateOrganizationCommand extends BaseCommand<
  UpdateOrganizationSchema & { organizationId: string },
  Organization
> {
  async validate(): Promise<void> {
    const result = updateOrganizationSchema.safeParse(this.input);
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
  }

  async authorize(): Promise<void> {
    const superAdmin = await isSuperAdmin(this.context.userId);
    if (superAdmin) return;

    const permissions = await getUserPermissions(this.context.userId, this.input.organizationId);
    const ability = createAbility(permissions);
    if (!ability.can(PERMISSIONS.ORGANIZATIONS_UPDATE)) throw new AuthorizationError();
  }

  async execute(): Promise<Organization> {
    const before = await findOrganizationById(this.input.organizationId);

    const updated = await updateOrganization(this.input.organizationId, {
      name: this.input.name,
      email: this.input.email || null,
      phone: this.input.phone || null,
      address: this.input.address || null,
      logoUrl: this.input.logoUrl || null,
      timezone: this.input.timezone,
      locale: this.input.locale,
    });

    await auditService.log(
      { ...this.context, organizationId: this.input.organizationId },
      {
        entity: "Organization",
        entityId: this.input.organizationId,
        action: "UPDATED",
        oldValues: before as Record<string, unknown>,
        newValues: updated as Record<string, unknown>,
      }
    );

    return updated;
  }
}
