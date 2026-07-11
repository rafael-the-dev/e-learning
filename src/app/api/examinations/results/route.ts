import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { CreateExamResultCommand } from "@/modules/examinations/commands/result-entry.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/results — create a DRAFT result (exams.enterResults).
export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new CreateExamResultCommand(
      {
        examCandidateId: body.examCandidateId as string,
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
