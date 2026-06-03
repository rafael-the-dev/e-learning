"use server";

import { runAction } from "@/shared/lib/action";
import { requireOrgContext } from "@/server/auth/session";
import { isOrgAdmin } from "@/server/auth/rbac";
import { AuthorizationError } from "@/shared/lib/command";
import { getDashboardData } from "@/modules/dashboard/services/dashboard.service";
import type { DashboardData } from "@/modules/dashboard/types";
import type { ActionResult } from "@/shared/types/common";

export async function getDashboardAction(): Promise<ActionResult<DashboardData>> {
  return runAction(async () => {
    const context = await requireOrgContext();
    const ok = await isOrgAdmin(context.userId, context.organizationId);
    if (!ok) throw new AuthorizationError();
    return getDashboardData(context.organizationId);
  });
}
