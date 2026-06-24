import bcrypt from "bcryptjs";
import { BaseCommand, AuthorizationError, ValidationError } from "@/shared/lib/command";
import { isSuperAdmin } from "@/server/auth/rbac";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findOrganizationBySlug,
  createOrganization,
} from "@/modules/organizations/repositories/organization.repository";
import { createBranch } from "@/modules/organizations/repositories/branch.repository";
import { createOrganizationSchema, type CreateOrganizationSchema } from "@/modules/organizations/schemas/organization.schema";
import { ensureDefaultNotificationConfig } from "@/modules/notifications/services/notification-defaults.service";
import { getDb } from "@/server/db";
import type { Organization } from "@prisma/client";

export class CreateOrganizationCommand extends BaseCommand<
  CreateOrganizationSchema,
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

    const db = await getDb();

    // Create the org admin user
    const passwordHash = await bcrypt.hash(this.input.adminPassword, 12);
    const adminUser = await db.user.create({
      data: {
        name: this.input.adminName,
        email: this.input.adminEmail,
        passwordHash,
        isActive: true,
      },
    });

    // Link admin as org owner
    await db.userOrganization.create({
      data: {
        userId: adminUser.id,
        organizationId: org.id,
        isOwner: true,
      },
    });

    // Assign ORG_ADMIN system role
    const orgAdminRole = await db.role.findFirst({
      where: { name: SYSTEM_ROLES.ORG_ADMIN, isSystem: true },
    });
    if (orgAdminRole) {
      await db.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: orgAdminRole.id,
          organizationId: org.id,
        },
      });
    }

    await ensureDefaultNotificationConfig(org.id);

    await auditService.log(
      { ...this.context, organizationId: org.id },
      { entity: "Organization", entityId: org.id, action: "CREATED", newValues: { name: org.name, slug: org.slug } }
    );

    return org;
  }
}
