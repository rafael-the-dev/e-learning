"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/shared/lib/action";
import { requireOrganization } from "@/server/auth/context";
import { CreateAttendanceSessionCommand } from "@/modules/attendance/commands/create-attendance-session.command";
import { UpdateAttendanceSessionCommand } from "@/modules/attendance/commands/update-attendance-session.command";
import { CancelAttendanceSessionCommand } from "@/modules/attendance/commands/cancel-attendance-session.command";
import { CompleteAttendanceSessionCommand } from "@/modules/attendance/commands/complete-attendance-session.command";
import { MarkAttendanceCommand } from "@/modules/attendance/commands/mark-attendance.command";
import { BulkMarkAttendanceCommand } from "@/modules/attendance/commands/bulk-mark-attendance.command";
import { UpdateAttendanceRecordCommand } from "@/modules/attendance/commands/update-attendance-record.command";
import { CreateAttendanceJustificationCommand } from "@/modules/attendance/commands/create-attendance-justification.command";
import { ApproveAttendanceJustificationCommand } from "@/modules/attendance/commands/approve-attendance-justification.command";
import { RejectAttendanceJustificationCommand } from "@/modules/attendance/commands/reject-attendance-justification.command";
import type {
  CreateAttendanceSessionSchema,
  UpdateAttendanceSessionSchema,
  CancelAttendanceSessionSchema,
  CompleteAttendanceSessionSchema,
  MarkAttendanceSchema,
  BulkMarkAttendanceSchema,
  UpdateAttendanceRecordSchema,
  CreateAttendanceJustificationSchema,
  ApproveAttendanceJustificationSchema,
  RejectAttendanceJustificationSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { ActionResult } from "@/shared/types/common";
import type {
  AttendanceSession,
  AttendanceRecord,
  AttendanceJustification,
} from "@/modules/attendance/types";

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createAttendanceSessionAction(
  input: CreateAttendanceSessionSchema
): Promise<ActionResult<AttendanceSession>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const session = await new CreateAttendanceSessionCommand(input, context).run();
    revalidatePath("/attendance/sessions");
    return session;
  });
}

export async function updateAttendanceSessionAction(
  input: UpdateAttendanceSessionSchema
): Promise<ActionResult<AttendanceSession>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const session = await new UpdateAttendanceSessionCommand(input, context).run();
    revalidatePath("/attendance/sessions");
    revalidatePath(`/attendance/sessions/${input.sessionId}`);
    return session;
  });
}

export async function cancelAttendanceSessionAction(
  input: CancelAttendanceSessionSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new CancelAttendanceSessionCommand(input, context).run();
    revalidatePath("/attendance/sessions");
    revalidatePath(`/attendance/sessions/${input.sessionId}`);
  });
}

export async function completeAttendanceSessionAction(
  input: CompleteAttendanceSessionSchema
): Promise<ActionResult<void>> {
  return runAction(async () => {
    const context = await requireOrganization();
    await new CompleteAttendanceSessionCommand(input, context).run();
    revalidatePath("/attendance/sessions");
    revalidatePath(`/attendance/sessions/${input.sessionId}`);
    revalidatePath("/attendance/reports");
  });
}

// ─── Records ──────────────────────────────────────────────────────────────────

export async function markAttendanceAction(
  input: MarkAttendanceSchema
): Promise<ActionResult<AttendanceRecord>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const record = await new MarkAttendanceCommand(input, context).run();
    revalidatePath(`/attendance/sessions/${input.sessionId}/mark`);
    return record;
  });
}

export async function bulkMarkAttendanceAction(
  input: BulkMarkAttendanceSchema
): Promise<ActionResult<AttendanceRecord[]>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const records = await new BulkMarkAttendanceCommand(input, context).run();
    revalidatePath(`/attendance/sessions/${input.sessionId}/mark`);
    revalidatePath(`/attendance/sessions/${input.sessionId}`);
    return records;
  });
}

export async function updateAttendanceRecordAction(
  input: UpdateAttendanceRecordSchema
): Promise<ActionResult<AttendanceRecord>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const record = await new UpdateAttendanceRecordCommand(input, context).run();
    revalidatePath("/attendance/sessions");
    revalidatePath("/attendance/reports");
    return record;
  });
}

// ─── Justifications ────────────────────────────────────────────────────────────

export async function createAttendanceJustificationAction(
  input: CreateAttendanceJustificationSchema
): Promise<ActionResult<AttendanceJustification>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const justification = await new CreateAttendanceJustificationCommand(input, context).run();
    revalidatePath("/attendance/justifications");
    return justification;
  });
}

export async function approveAttendanceJustificationAction(
  input: ApproveAttendanceJustificationSchema
): Promise<ActionResult<AttendanceJustification>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const justification = await new ApproveAttendanceJustificationCommand(input, context).run();
    revalidatePath("/attendance/justifications");
    revalidatePath("/attendance/reports");
    return justification;
  });
}

export async function rejectAttendanceJustificationAction(
  input: RejectAttendanceJustificationSchema
): Promise<ActionResult<AttendanceJustification>> {
  return runAction(async () => {
    const context = await requireOrganization();
    const justification = await new RejectAttendanceJustificationCommand(input, context).run();
    revalidatePath("/attendance/justifications");
    return justification;
  });
}
