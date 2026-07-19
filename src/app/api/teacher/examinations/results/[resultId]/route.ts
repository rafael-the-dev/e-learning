import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { UpdateDraftExamResultCommand } from "@/modules/examinations/commands/result-entry.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// PATCH /api/teacher/examinations/results/:resultId — edit a DRAFT result. Thin shell
// over the HARDENED UpdateDraftExamResultCommand (ADR-017): only a DRAFT is editable;
// the command resolves the teacher server-side and enforces org + active assignment +
// role (CHIEF/MARKER) in-tx (session resolved via result → candidate → session).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ resultId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { resultId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new UpdateDraftExamResultCommand(
      {
        examResultId: resultId,
        score: body.score as number | undefined,
        maxScore: body.maxScore as number | undefined,
        resultCode: body.resultCode as string | undefined,
        remarks: body.remarks as string | undefined,
        reason: body.reason as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
