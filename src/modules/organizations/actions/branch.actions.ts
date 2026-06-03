"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireServiceContext } from "@/server/auth/session";
import { CreateBranchCommand } from "@/modules/organizations/commands/create-branch.command";
import { UpdateBranchCommand } from "@/modules/organizations/commands/update-branch.command";
import type { CreateBranchSchema } from "@/modules/organizations/schemas/branch.schema";
import type { UpdateBranchSchema } from "@/modules/organizations/schemas/branch.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Branch } from "@prisma/client";

export async function createBranchAction(
  organizationId: string,
  input: CreateBranchSchema
): Promise<ActionResult<Branch>> {
  return runAction(async () => {
    const context = await requireServiceContext(organizationId);
    const cmd = new CreateBranchCommand({ ...input, organizationId }, context);
    const branch = await cmd.run();
    revalidatePath(`/organizations/${organizationId}`);
    return branch;
  });
}

export async function updateBranchAction(
  organizationId: string,
  branchId: string,
  input: UpdateBranchSchema
): Promise<ActionResult<Branch>> {
  return runAction(async () => {
    const context = await requireServiceContext(organizationId);
    const cmd = new UpdateBranchCommand({ ...input, organizationId, branchId }, context);
    const branch = await cmd.run();
    revalidatePath(`/organizations/${organizationId}`);
    return branch;
  });
}

export async function deleteBranchAction(
  organizationId: string,
  branchId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireServiceContext(organizationId);
    const { isSuperAdmin, getUserPermissions, createAbility } = await import("@/server/auth/rbac");
    const { PERMISSIONS } = await import("@/server/auth/permissions");
    const { AuthorizationError, BusinessRuleError } = await import("@/shared/lib/command");
    const { softDeleteBranch, findBranchById } = await import(
      "@/modules/organizations/repositories/branch.repository"
    );
    const { auditService } = await import("@/modules/audit-logs/services/audit.service");

    const superAdmin = await isSuperAdmin(context.userId);
    if (!superAdmin) {
      const perms = await getUserPermissions(context.userId, organizationId);
      const ability = createAbility(perms);
      if (!ability.can(PERMISSIONS.BRANCHES_DELETE)) throw new AuthorizationError();
    }

    const branch = await findBranchById(organizationId, branchId);
    if (!branch) throw new Error("Branch not found");
    if (branch.isDefault) throw new BusinessRuleError("Cannot delete the default branch");

    await softDeleteBranch(organizationId, branchId);
    await auditService.log(context, {
      entity: "Branch",
      entityId: branchId,
      action: "DELETED",
      oldValues: { name: branch.name },
    });
    revalidatePath(`/organizations/${organizationId}`);
  });
}
