import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import {
  MarkExamCandidateAttendanceCommand,
  CorrectExamCandidateAttendanceCommand,
} from "@/modules/examinations/commands/attendance.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// =============================================================================
// Teacher attendance — mark (POST) + correct (PATCH) a candidate's attendance.
// -----------------------------------------------------------------------------
// Thin shells over the HARDENED engine commands (ADR-017): the command resolves the
// acting Teacher server-side and enforces org + ACTIVE assignment on the resolved
// session + authorizing role (attendance ← CHIEF/INVIGILATOR/MARKER) IN-TX. The
// endpoint NEVER accepts a teacherId and does NOT re-implement authorization — the
// command is the sole authority. examCandidateId comes from the URL.
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { candidateId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new MarkExamCandidateAttendanceCommand(
      {
        examCandidateId: candidateId,
        status: body.status as string,
        checkedInAt: body.checkedInAt as string | undefined,
        remarks: body.remarks as string | undefined,
        reason: body.reason as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapExaminationError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { candidateId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new CorrectExamCandidateAttendanceCommand(
      {
        examCandidateId: candidateId,
        status: body.status as string,
        checkedInAt: body.checkedInAt as string | undefined,
        remarks: body.remarks as string | undefined,
        reason: body.reason as string,
      },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
