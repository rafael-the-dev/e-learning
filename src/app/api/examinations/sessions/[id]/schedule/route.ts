import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { ScheduleExamSessionCommand } from "@/modules/examinations/commands/exam-session.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/schedule — DRAFT → SCHEDULED (exams.schedule).
export async function POST(
  _req: Request,
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
    return NextResponse.json(await new ScheduleExamSessionCommand({ sessionId: id }, context).run());
  } catch (err) {
    return mapExaminationError(err);
  }
}
