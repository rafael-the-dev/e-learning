import { BaseCommand, AuthorizationError, ValidationError, NotFoundError, BusinessRuleError } from "@/shared/lib/command";
import { isSuperAdmin } from "@/server/auth/rbac";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findOrganizationById,
  updateOrganization,
} from "@/modules/organizations/repositories/organization.repository";
import type { Organization } from "@prisma/client";

interface SuspendOrganizationInput {
  organizationId: string;
  reason?: string;
}

export class SuspendOrganizationCommand extends BaseCommand<
  SuspendOrganizationInput,
  Organization
> {
  async validate(): Promise<void> {
    const org = await findOrganizationById(this.input.organizationId);
    if (!org) throw new NotFoundError("Organization", this.input.organizationId);
    if (org.status === "SUSPENDED") {
      throw new BusinessRuleError("Organization is already suspended");
    }
    if (org.status === "CANCELLED") {
      throw new BusinessRuleError("Cannot suspend a cancelled organization");
    }
  }

  async authorize(): Promise<void> {
    const ok = await isSuperAdmin(this.context.userId);
    if (!ok) throw new AuthorizationError();
  }

  async execute(): Promise<Organization> {
    const before = await findOrganizationById(this.input.organizationId);

    const updated = await updateOrganization(this.input.organizationId, {
      status: "SUSPENDED",
    });

    await auditService.log(
      { ...this.context, organizationId: this.input.organizationId },
      {
        entity: "Organization",
        entityId: this.input.organizationId,
        action: "SUSPENDED",
        oldValues: { status: before?.status },
        newValues: { status: "SUSPENDED", reason: this.input.reason },
      }
    );

    return updated;
  }
}
