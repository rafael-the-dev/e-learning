import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { isSuperAdmin } from "@/server/auth/rbac";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findOrganizationBySlug,
  createOrganization,
} from "@/modules/organizations/repositories/organization.repository";
import { createBranch } from "@/modules/organizations/repositories/branch.repository";
import { createOrganizationSchema, type CreateOrganizationSchema } from "@/modules/organizations/schemas/organization.schema";
import { getDb } from "@/server/db";
import type { Organization } from "@prisma/client";

export class CreateOrganizationCommand extends BaseCommand<
  CreateOrganizationSchema & { ownerUserId?: string },
  Organization
> {
  async validate(): Promise<void> {
    const result = createOrganizationSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Validation failed", fieldErrors);
    }

    const existing = await findOrganizationBySlug(this.input.slug);
    if (existing) {
      throw new ValidationError("Validation failed", {
        slug: ["This slug is already taken"],
      });
    }
  }

  async authorize(): Promise<void> {
    const ok = await isSuperAdmin(this.context.userId);
    if (!ok) throw new AuthorizationError();
  }

  async execute(): Promise<Organization> {
    const org = await createOrganization({
      name: this.input.name,
      slug: this.input.slug,
      email: this.input.email || undefined,
      phone: this.input.phone || undefined,
      address: this.input.address || undefined,
      timezone: this.input.timezone ?? "UTC",
      locale: this.input.locale ?? "en",
    });

    // Create the default branch for this organization
    await createBranch({
      organizationId: org.id,
      name: "Main Branch",
      isDefault: true,
    });

    // Assign the owner to the org if provided
    if (this.input.ownerUserId) {
      const db = await getDb();
      await db.userOrganization.create({
        data: {
          userId: this.input.ownerUserId,
          organizationId: org.id,
          isOwner: true,
        },
      });
    }

    await auditService.log(
      { ...this.context, organizationId: org.id },
      { entity: "Organization", entityId: org.id, action: "CREATED", newValues: { name: org.name, slug: org.slug } }
    );

    return org;
  }
}
