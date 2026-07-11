import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { IntegratePublishedExamResultCommand } from "@/modules/examinations/commands/integration.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/results/:id/integrate — push the official result into Grade
// (exams.integrateResults). Delegates to the production integration command.
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
    const result = await new IntegratePublishedExamResultCommand(
      { examResultId: id, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
