import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examIntegrationAdminReadService } from "@/modules/examinations/services/admin/exam-integration-admin-read.service";
import { BindExamSessionToGradeComponentCommand } from "@/modules/examinations/commands/binding.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions/:id/grade-binding — binding + compatibility (exams.view).
// POST /api/examinations/sessions/:id/grade-binding — bind a component (exams.integrateResults).
export async function GET(
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
    return NextResponse.json(await examIntegrationAdminReadService.getBinding(context, id));
  } catch (err) {
    return mapExaminationError(err);
  }
}

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
    const result = await new BindExamSessionToGradeComponentCommand(
      { examSessionId: id, assessmentComponentId: body.assessmentComponentId as string, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapExaminationError(err);
  }
}
