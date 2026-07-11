import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examResultAdminReadService } from "@/modules/examinations/services/admin/exam-result-admin-read.service";
import { UpdateDraftExamResultCommand } from "@/modules/examinations/commands/result-entry.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/results/:id — result detail + allowedActions (exams.view).
// PATCH /api/examinations/results/:id — update a DRAFT result (exams.enterResults).
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
    const detail = await examResultAdminReadService.getDetail(context, id);
    if (!detail) return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    return mapExaminationError(err);
  }
}

export async function PATCH(
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
    const result = await new UpdateDraftExamResultCommand(
      {
        examResultId: id,
        score: body.score as number | undefined,
        maxScore: body.maxScore as number | undefined,
        resultCode: body.resultCode as string | undefined,
        remarks: body.remarks as string | undefined,
        reason: body.reason as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
