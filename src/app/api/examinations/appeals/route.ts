import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examAppealAdminReadService } from "@/modules/examinations/services/admin/exam-appeal-admin-read.service";
import { mapExaminationError, parseExamAppealListFilters } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/appeals — org-scoped appeal list (exams.view).
export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const filters = parseExamAppealListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await examAppealAdminReadService.list(context, filters));
  } catch (err) {
    return mapExaminationError(err);
  }
}
