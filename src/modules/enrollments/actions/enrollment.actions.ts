"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateEnrollmentCommand } from "@/modules/enrollments/commands/create-enrollment.command";
import { UpdateEnrollmentCommand } from "@/modules/enrollments/commands/update-enrollment.command";
import { ActivateEnrollmentCommand } from "@/modules/enrollments/commands/activate-enrollment.command";
import { SuspendEnrollmentCommand } from "@/modules/enrollments/commands/suspend-enrollment.command";
import { CancelEnrollmentCommand } from "@/modules/enrollments/commands/cancel-enrollment.command";
import { CompleteEnrollmentCommand } from "@/modules/enrollments/commands/complete-enrollment.command";
import { SoftDeleteEnrollmentCommand } from "@/modules/enrollments/commands/delete-enrollment.command";
import type {
  CreateEnrollmentSchema,
  UpdateEnrollmentSchema,
} from "@/modules/enrollments/schemas/enrollment.schema";
import type { ActionResult } from "@/shared/types/common";
import type { Enrollment } from "@/modules/enrollments/types";

export async function createEnrollmentAction(
  input: CreateEnrollmentSchema
): Promise<ActionResult<Enrollment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CreateEnrollmentCommand(input, context);
    const enrollment = await cmd.run();
    revalidatePath("/enrollments");
    return enrollment;
  });
}

export async function updateEnrollmentAction(
  enrollmentId: string,
  input: UpdateEnrollmentSchema
): Promise<ActionResult<Enrollment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new UpdateEnrollmentCommand({ enrollmentId, ...input }, context);
    const enrollment = await cmd.run();
    revalidatePath("/enrollments");
    revalidatePath(`/enrollments/${enrollmentId}`);
    return enrollment;
  });
}

export async function activateEnrollmentAction(
  enrollmentId: string,
  reason?: string
): Promise<ActionResult<Enrollment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new ActivateEnrollmentCommand({ enrollmentId, reason }, context);
    const enrollment = await cmd.run();
    revalidatePath("/enrollments");
    revalidatePath(`/enrollments/${enrollmentId}`);
    return enrollment;
  });
}

export async function suspendEnrollmentAction(
  enrollmentId: string,
  reason: string
): Promise<ActionResult<Enrollment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SuspendEnrollmentCommand({ enrollmentId, reason }, context);
    const enrollment = await cmd.run();
    revalidatePath("/enrollments");
    revalidatePath(`/enrollments/${enrollmentId}`);
    return enrollment;
  });
}

export async function cancelEnrollmentAction(
  enrollmentId: string,
  reason: string
): Promise<ActionResult<Enrollment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CancelEnrollmentCommand({ enrollmentId, reason }, context);
    const enrollment = await cmd.run();
    revalidatePath("/enrollments");
    revalidatePath(`/enrollments/${enrollmentId}`);
    return enrollment;
  });
}

export async function completeEnrollmentAction(
  enrollmentId: string,
  reason?: string
): Promise<ActionResult<Enrollment>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new CompleteEnrollmentCommand({ enrollmentId, reason }, context);
    const enrollment = await cmd.run();
    revalidatePath("/enrollments");
    revalidatePath(`/enrollments/${enrollmentId}`);
    return enrollment;
  });
}

export async function deleteEnrollmentAction(
  enrollmentId: string
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const cmd = new SoftDeleteEnrollmentCommand({ enrollmentId }, context);
    await cmd.run();
    revalidatePath("/enrollments");
  });
}
