import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { SubmitExamResultCommand } from "@/modules/examinations/commands/result-entry.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/teacher/examinations/results/:resultId/submit — DRAFT → SUBMITTED (the
// teacher's write ceiling). Thin shell over the HARDENED SubmitExamResultCommand
// (ADR-017): session must be COMPLETED, the row internally consistent + not stale;
// the command resolves the teacher server-side and enforces org + active assignment +
// role (CHIEF/MARKER) in-tx. Never review/approve/publish.
export async function POST(
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
    const result = await new SubmitExamResultCommand(
      { examResultId: resultId, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
