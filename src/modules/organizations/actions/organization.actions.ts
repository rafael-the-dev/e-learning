"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireAdminContext, requireServiceContext } from "@/server/auth/session";
import { CreateOrganizationCommand } from "@/modules/organizations/commands/create-organization.command";
import { UpdateOrganizationCommand } from "@/modules/organizations/commands/update-organization.command";
import { SuspendOrganizationCommand } from "@/modules/organizations/commands/suspend-organization.command";
import { saveSettings } from "@/modules/organizations/services/organization.service";
import type { CreateOrganizationSchema } from "@/modules/organizations/schemas/organization.schema";
import type { UpdateOrganizationSchema } from "@/modules/organizations/schemas/organization.schema";
import type { UpdateSettingsSchema } from "@/modules/organizations/schemas/settings.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Organization, OrganizationSettings } from "@prisma/client";

export async function createOrganizationAction(
  input: CreateOrganizationSchema
): Promise<ActionResult<Organization>> {
  return runAction(async () => {
    const context = await requireAdminContext();
    const cmd = new CreateOrganizationCommand(input, context);
    const org = await cmd.run();
    revalidatePath("/organizations");
    return org;
  });
}

export async function updateOrganizationAction(
  organizationId: string,
  input: UpdateOrganizationSchema
): Promise<ActionResult<Organization>> {
  return runAction(async () => {
    const context = await requireServiceContext(organizationId);
    const cmd = new UpdateOrganizationCommand(
      { ...input, organizationId },
      context
    );
    const org = await cmd.run();
    revalidatePath(`/organizations/${organizationId}`);
    revalidatePath("/organizations");
    return org;
  });
}

export async function suspendOrganizationAction(
  organizationId: string,
  reason?: string
): Promise<ActionResult<Organization>> {
  return runAction(async () => {
    const context = await requireAdminContext();
    const cmd = new SuspendOrganizationCommand(
      { organizationId, reason },
      context
    );
    const org = await cmd.run();
    revalidatePath(`/organizations/${organizationId}`);
    revalidatePath("/organizations");
    return org;
  });
}

export async function activateOrganizationAction(
  organizationId: string
): Promise<ActionResult<Organization>> {
  return runAction(async () => {
    const context = await requireAdminContext();
    const { updateOrganization } = await import(
      "@/modules/organizations/repositories/organization.repository"
    );
    const { auditService } = await import(
      "@/modules/audit-logs/services/audit.service"
    );
    const { isSuperAdmin } = await import("@/server/auth/rbac");
    const { AuthorizationError } = await import("@/shared/lib/command");

    const ok = await isSuperAdmin(context.userId);
    if (!ok) throw new AuthorizationError();

    const org = await updateOrganization(organizationId, { status: "ACTIVE" });
    await auditService.log(
      { ...context, organizationId },
      { entity: "Organization", entityId: organizationId, action: "STATUS_CHANGED", newValues: { status: "ACTIVE" } }
    );
    revalidatePath(`/organizations/${organizationId}`);
    revalidatePath("/organizations");
    return org;
  });
}

export async function saveSettingsAction(
  organizationId: string,
  input: UpdateSettingsSchema
): Promise<ActionResult<OrganizationSettings>> {
  return runAction(async () => {
    const context = await requireServiceContext(organizationId);
    const settings = await saveSettings(organizationId, input, context);
    revalidatePath(`/organizations/${organizationId}`);
    return settings;
  });
}
