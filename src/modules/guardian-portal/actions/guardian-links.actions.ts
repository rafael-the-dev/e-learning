"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/shared/lib/action";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  ensureGuardianPortalUser,
  resendGuardianInvite,
  removeGuardianLink,
  updateGuardianLinkPermissions,
} from "@/modules/guardian-portal/services/guardian-provisioning.service";
import type { ActionResult } from "@/shared/types/common";

// =============================================================================
// GUARDIAN LINK ACTIONS — Student 360 "Encarregados" card
// All gated by GUARDIAN_LINKS_MANAGE (ORG_ADMIN/SUPER_ADMIN via wildcard;
// SECRETARY explicitly). organizationId and the actor are always taken from the
// authenticated context — never from the client.
// =============================================================================

const relationshipEnum = z.enum(["FATHER", "MOTHER", "GUARDIAN", "SPONSOR", "OTHER"]);

const addGuardianSchema = z.object({
  studentId: z.string().min(1),
  guardianEmail: z.string().email("Email inválido"),
  guardianName: z.string().min(2, "O nome deve ter pelo menos 2 caracteres"),
  relationshipType: relationshipEnum,
  isPrimary: z.boolean().optional(),
  canViewAcademic: z.boolean(),
  canViewAttendance: z.boolean(),
  canViewFinance: z.boolean(),
  canViewDocuments: z.boolean(),
  canReceiveNotifications: z.boolean(),
});

export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

export async function addGuardianLinkAction(
  input: AddGuardianInput
): Promise<ActionResult<{ status: string; inviteUrl?: string }>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
    const data = addGuardianSchema.parse(input);
    const res = await ensureGuardianPortalUser({
      organizationId: context.organizationId,
      studentId: data.studentId,
      guardianEmail: data.guardianEmail,
      guardianName: data.guardianName,
      relationshipType: data.relationshipType,
      isPrimary: data.isPrimary,
      canViewAcademic: data.canViewAcademic,
      canViewAttendance: data.canViewAttendance,
      canViewFinance: data.canViewFinance,
      canViewDocuments: data.canViewDocuments,
      canReceiveNotifications: data.canReceiveNotifications,
      triggeredByUserId: context.userId,
      reason: "MANUAL",
    });
    revalidatePath(`/students/${data.studentId}`);
    return { status: res.status, inviteUrl: res.inviteUrl };
  });
}

const updateSchema = z.object({
  linkId: z.string().min(1),
  studentId: z.string().min(1),
  relationshipType: relationshipEnum.optional(),
  isPrimary: z.boolean().optional(),
  canViewAcademic: z.boolean().optional(),
  canViewAttendance: z.boolean().optional(),
  canViewFinance: z.boolean().optional(),
  canViewDocuments: z.boolean().optional(),
  canReceiveNotifications: z.boolean().optional(),
});

export type UpdateGuardianInput = z.infer<typeof updateSchema>;

export async function updateGuardianLinkAction(
  input: UpdateGuardianInput
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
    const { linkId, studentId, ...rest } = updateSchema.parse(input);
    await updateGuardianLinkPermissions(linkId, context.organizationId, rest, context.userId);
    revalidatePath(`/students/${studentId}`);
    return { ok: true as const };
  });
}

export async function resendGuardianInviteAction(
  linkId: string,
  studentId: string
): Promise<ActionResult<{ status: string; inviteUrl?: string }>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
    const res = await resendGuardianInvite(linkId, context.organizationId, context.userId);
    revalidatePath(`/students/${studentId}`);
    return { status: res.status, inviteUrl: res.inviteUrl };
  });
}

export async function removeGuardianLinkAction(
  linkId: string,
  studentId: string
): Promise<ActionResult<{ ok: true }>> {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.GUARDIAN_LINKS_MANAGE);
    await removeGuardianLink(linkId, context.organizationId, context.userId);
    revalidatePath(`/students/${studentId}`);
    return { ok: true as const };
  });
}
