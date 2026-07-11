import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { CancelExamPeriodCommand } from "@/modules/examinations/commands/exam-period.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/periods/:id/cancel — pre-terminal → CANCELLED (exams.schedule).
// A reason is required by the command.
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
    const result = await new CancelExamPeriodCommand(
      { periodId: id, reason: body.reason as string },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
