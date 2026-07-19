import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { CreateExamResultCommand } from "@/modules/examinations/commands/result-entry.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/teacher/examinations/candidates/:candidateId/results — create a DRAFT
// result. Thin shell over the HARDENED CreateExamResultCommand (ADR-017): it resolves
// the teacher server-side and enforces org + active assignment + role (CHIEF/MARKER)
// in-tx; the attendance fact drives the resultCode (never a free choice). Never
// accepts teacherId / markerId / status.
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
    const result = await new CreateExamResultCommand(
      {
        examCandidateId: candidateId,
        score: body.score as number | undefined,
        maxScore: body.maxScore as number,
        resultCode: body.resultCode as string | undefined,
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
