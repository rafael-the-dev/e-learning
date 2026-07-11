import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { DisqualifyExamCandidateCommand } from "@/modules/examinations/commands/candidate-status.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/candidates/:id/disqualify — REGISTERED → DISQUALIFIED
// (reason required; exams.registerCandidates).
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
    const result = await new DisqualifyExamCandidateCommand(
      { examCandidateId: id, reason: body.reason as string },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
