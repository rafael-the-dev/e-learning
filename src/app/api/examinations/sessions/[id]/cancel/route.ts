import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { CancelExamSessionCommand } from "@/modules/examinations/commands/exam-session.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/cancel — DRAFT|SCHEDULED|LOCKED → CANCELLED
// (exams.schedule). A reason is required by the command.
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
    const result = await new CancelExamSessionCommand(
      { sessionId: id, reason: body.reason as string },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
