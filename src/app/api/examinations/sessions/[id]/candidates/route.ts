import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examCandidateAdminReadService } from "@/modules/examinations/services/admin/exam-candidate-admin-read.service";
import {
  mapExaminationError,
  parseExamCandidateListFilters,
} from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions/:id/candidates — session-scoped candidate roster (exams.view).
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
    const filters = parseExamCandidateListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await examCandidateAdminReadService.listBySession(context, id, filters));
  } catch (err) {
    return mapExaminationError(err);
  }
}
