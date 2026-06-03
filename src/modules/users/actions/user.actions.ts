"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateOrganizationUserCommand } from "@/modules/users/commands/create-org-user.command";
import { UpdateOrganizationUserCommand } from "@/modules/users/commands/update-org-user.command";
import { DisableOrganizationUserCommand } from "@/modules/users/commands/disable-org-user.command";
import { AssignUserRoleCommand } from "@/modules/users/commands/assign-user-role.command";
import { RemoveUserFromOrganizationCommand } from "@/modules/users/commands/remove-user-from-org.command";
import { setUserActiveStatus } from "@/modules/users/repositories/user.repository";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import type { CreateUserSchema, UpdateUserSchema } from "@/modules/users/schemas/user.schema";
import type { ActionResult } from "@/shared/types/common";
import type { OrgUser } from "@/modules/users/types";

export async function createOrgUserAction(
  input: CreateUserSchema
): Promise<ActionResult<OrgUser>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateOrganizationUserCommand(input, context);
    const user = await cmd.run();
    revalidatePath("/users");
    return user;
  });
}

export async function updateOrgUserAction(
  userId: string,
  input: UpdateUserSchema
): Promise<ActionResult<OrgUser>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateOrganizationUserCommand(
      { userId, ...input },
      context
    );
    const user = await cmd.run();
    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
    return user;
  });
}

export async function disableOrgUserAction(
  userId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new DisableOrganizationUserCommand({ userId }, context);
    await cmd.run();
    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
  });
}

export async function enableOrgUserAction(
  userId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await setUserActiveStatus(userId, true);
    await auditService.log(context, {
      entity: "User",
      entityId: userId,
      action: "STATUS_CHANGED",
      newValues: { isActive: true },
    });
    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
  });
}

export async function assignUserRoleAction(
  userId: string,
  roleId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new AssignUserRoleCommand({ userId, roleId }, context);
    await cmd.run();
    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
  });
}

export async function removeUserFromOrgAction(
  userId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new RemoveUserFromOrganizationCommand({ userId }, context);
    await cmd.run();
    revalidatePath("/users");
  });
}
