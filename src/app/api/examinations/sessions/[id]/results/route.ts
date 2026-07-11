import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examResultAdminReadService } from "@/modules/examinations/services/admin/exam-result-admin-read.service";
import { mapExaminationError, parseExamResultListFilters } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions/:id/results — session result roster (exams.view).
export async function GET(
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
    const filters = parseExamResultListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await examResultAdminReadService.listBySession(context, id, filters));
  } catch (err) {
    return mapExaminationError(err);
  }
}
