"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requirePermission } from "@/server/auth/context";
import { AuthorizationError } from "@/shared/lib/command";
import { PERMISSIONS, SYSTEM_ROLES } from "@/server/auth/permissions";
import {
  ensureStudentPortalUser,
  resendStudentPortalInvite,
  unlinkStudentPortalAccount,
  type StudentProvisionStatus,
  type ResendInviteResult,
  type UnlinkResult,
} from "@/modules/students/services/student-user-provisioning.service";
import type { ActionResult } from "@/shared/types/common";

export interface PortalAccountActionResult {
  status: StudentProvisionStatus | ResendInviteResult["status"] | UnlinkResult["status"];
  inviteUrl?: string;
}

/** Create or link the student's Portal login manually (admin remediation). */
export async function createOrLinkStudentPortalAccountAction(
  studentId: string
): Promise<ActionResult<PortalAccountActionResult>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.STUDENTS_MANAGE_PORTAL_ACCOUNT);
    const res = await ensureStudentPortalUser({
      organizationId: context.organizationId,
      studentId,
      triggeredByUserId: context.userId,
      reason: "MANUAL",
    });
    revalidatePath(`/students/${studentId}`);
    return { status: res.status, inviteUrl: res.inviteUrl };
  });
}

/** Re-issue the set-password invite (creates/links first if needed). */
export async function resendStudentPortalInviteAction(
  studentId: string
): Promise<ActionResult<PortalAccountActionResult>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.STUDENTS_MANAGE_PORTAL_ACCOUNT);
    const res = await resendStudentPortalInvite(studentId, context.organizationId, context.userId);
    revalidatePath(`/students/${studentId}`);
    return { status: res.status, inviteUrl: res.inviteUrl };
  });
}

/**
 * Unlink the Portal login from the student. Restricted to ORG_ADMIN/SUPER_ADMIN
 * — the manage permission is already admin-only, but we assert the role too so
 * unlink stays admin-only even if the permission is ever granted more broadly.
 */
export async function unlinkStudentPortalAccountAction(
  studentId: string
): Promise<ActionResult<PortalAccountActionResult>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.STUDENTS_MANAGE_PORTAL_ACCOUNT);
    const isAdmin = context.roles.some(
      (r) => r === SYSTEM_ROLES.ORG_ADMIN || r === SYSTEM_ROLES.SUPER_ADMIN
    );
    if (!isAdmin) {
      throw new AuthorizationError("Apenas administradores podem desvincular contas do portal.");
    }
    const res = await unlinkStudentPortalAccount(studentId, context.organizationId, context.userId);
    revalidatePath(`/students/${studentId}`);
    return { status: res.status };
  });
}
