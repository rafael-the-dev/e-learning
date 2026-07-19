import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkSubmitExamResultsCommand } from "@/modules/examinations/commands/result-entry.commands";
import type { BulkSubmitExamResultsInput } from "@/modules/examinations/schemas/result-entry.schema";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/teacher/examinations/sessions/:sessionId/results/submit-bulk — bulk-submit
// DRAFT results (DRAFT → SUBMITTED). Thin shell over the HARDENED bulk runner: it
// verifies each result belongs to the session AND delegates to the single Submit
// command per item (in-tx assignment gate + COMPLETED-session + consistency/staleness).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { sessionId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkSubmitExamResultsCommand(
      {
        examSessionId: sessionId,
        items: body.items,
        stopOnFailure: body.stopOnFailure,
      } as BulkSubmitExamResultsInput,
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
