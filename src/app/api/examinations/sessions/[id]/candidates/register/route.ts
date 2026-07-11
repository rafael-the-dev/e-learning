import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { RegisterExamCandidateCommand } from "@/modules/examinations/commands/candidate-registration.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/candidates/register — register a candidate
// (normal eligibility path; exams.registerCandidates).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new RegisterExamCandidateCommand(
      {
        examSessionId: id,
        studentId: body.studentId as string,
        enrollmentId: body.enrollmentId as string,
        levelSubjectId: body.levelSubjectId as string,
        assignedSeat: body.assignedSeat as string | undefined,
        reason: body.reason as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapExaminationError(err);
  }
}
