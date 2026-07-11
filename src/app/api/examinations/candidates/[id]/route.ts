import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examCandidateAdminReadService } from "@/modules/examinations/services/admin/exam-candidate-admin-read.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/candidates/:id — candidate detail + allowlisted eligibility
// provenance + attendance/result overlay (exams.view).
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
    const detail = await examCandidateAdminReadService.getDetail(context, id);
    if (!detail) return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    return mapExaminationError(err);
  }
}
