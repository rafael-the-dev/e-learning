import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { CorrectExamCandidateAttendanceCommand } from "@/modules/examinations/commands/attendance.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/attendance/:candidateId/correct — correct a recorded exam
// attendance (exams.correctAttendance); `reason` is required by the command schema.
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
    const result = await new CorrectExamCandidateAttendanceCommand(
      {
        examCandidateId: candidateId,
        status: body.status as string,
        checkedInAt: body.checkedInAt as Date | undefined,
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
