import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { ReconcileExamResultIntegrationCommand } from "@/modules/examinations/commands/integration.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/results/:id/reconcile — repair a stale integration
// (exams.integrateResults). `dryRun` defaults true in the command.
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
    const result = await new ReconcileExamResultIntegrationCommand(
      { examResultId: id, dryRun: body.dryRun as boolean | undefined, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
