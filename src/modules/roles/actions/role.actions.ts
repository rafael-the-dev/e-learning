"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateOrganizationRoleCommand } from "@/modules/roles/commands/create-organization-role.command";
import { UpdateOrganizationRoleCommand } from "@/modules/roles/commands/update-organization-role.command";
import { DuplicateOrganizationRoleCommand } from "@/modules/roles/commands/duplicate-organization-role.command";
import { ArchiveOrganizationRoleCommand } from "@/modules/roles/commands/archive-organization-role.command";
import { RestoreOrganizationRoleCommand } from "@/modules/roles/commands/restore-organization-role.command";
import { UpdateRolePermissionsCommand } from "@/modules/roles/commands/update-role-permissions.command";
import type {
  CreateOrganizationRoleSchema,
  UpdateOrganizationRoleSchema,
  DuplicateOrganizationRoleSchema,
} from "@/modules/roles/schemas/role.schema";
import type { ActionResult } from "@/shared/types/common";

export async function createOrganizationRoleAction(
  input: CreateOrganizationRoleSchema
): Promise<ActionResult<{ id: string; name: string; code: string | null }>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateOrganizationRoleCommand(input, context);
    const role = await cmd.run();
    revalidatePath("/settings/roles");
    return role;
  });
}

export async function updateOrganizationRoleAction(
  roleId: string,
  input: UpdateOrganizationRoleSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateOrganizationRoleCommand({ roleId, ...input }, context);
    await cmd.run();
    revalidatePath("/settings/roles");
    revalidatePath(`/settings/roles/${roleId}`);
  });
}

export async function duplicateOrganizationRoleAction(
  input: DuplicateOrganizationRoleSchema
): Promise<ActionResult<{ id: string; name: string; code: string | null }>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DuplicateOrganizationRoleCommand(input, context);
    const role = await cmd.run();
    revalidatePath("/settings/roles");
    return role;
  });
}

export async function archiveOrganizationRoleAction(
  roleId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ArchiveOrganizationRoleCommand({ roleId }, context);
    await cmd.run();
    revalidatePath("/settings/roles");
    revalidatePath(`/settings/roles/${roleId}`);
  });
}

export async function restoreOrganizationRoleAction(
  roleId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RestoreOrganizationRoleCommand({ roleId }, context);
    await cmd.run();
    revalidatePath("/settings/roles");
    revalidatePath(`/settings/roles/${roleId}`);
  });
}

export async function updateRolePermissionsAction(
  roleId: string,
  permissionIds: string[]
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateRolePermissionsCommand({ roleId, permissionIds }, context);
    await cmd.run();
    revalidatePath(`/settings/roles/${roleId}`);
  });
}
