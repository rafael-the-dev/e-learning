import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { MarkExamCandidateAttendanceCommand } from "@/modules/examinations/commands/attendance.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/attendance — mark a candidate's exam attendance (exams.markAttendance).
export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new MarkExamCandidateAttendanceCommand(
      {
        examCandidateId: body.examCandidateId as string,
        status: body.status as string,
        checkedInAt: body.checkedInAt as Date | undefined,
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
