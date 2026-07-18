import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { CreateExamAppealCommand } from "@/modules/examinations/commands/appeals.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// =============================================================================
// POST /api/student/examinations/results/:resultId/appeals
// -----------------------------------------------------------------------------
// A student files an appeal against their OWN published result. This is a
// student-scoped endpoint (NOT the admin appeal API): it delegates to the existing
// CreateExamAppealCommand, which resolves the acting Student server-side and
// enforces ownership + result-PUBLISHED + single-active-appeal. studentId /
// requestedById are NEVER taken from the client. Returns a student-facing DTO only.
// =============================================================================

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
    const result = await new CreateExamAppealCommand(
      { examResultId: resultId, reason: typeof body.reason === "string" ? body.reason : "" },
      context
    ).run();
    return NextResponse.json(
      { appealId: result.appealId, status: result.status, submittedAt: result.createdAt },
      { status: 201 }
    );
  } catch (err) {
    return mapExaminationError(err);
  }
}
