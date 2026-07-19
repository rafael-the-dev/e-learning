import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkCreateExamResultsCommand } from "@/modules/examinations/commands/result-entry.commands";
import type { BulkCreateExamResultsInput } from "@/modules/examinations/schemas/result-entry.schema";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/teacher/examinations/sessions/:sessionId/results/bulk — bulk-create DRAFT
// results. Thin shell over the HARDENED bulk runner: it verifies each candidate
// belongs to the session AND delegates to the single Create command per item, which
// re-checks the in-tx assignment gate — so a mixed batch never writes unauthorized.
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
    const result = await new BulkCreateExamResultsCommand(
      {
        examSessionId: sessionId,
        items: body.items,
        stopOnFailure: body.stopOnFailure,
      } as BulkCreateExamResultsInput,
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
