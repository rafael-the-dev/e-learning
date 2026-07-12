import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examCandidateAdminReadService } from "@/modules/examinations/services/admin/exam-candidate-admin-read.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions/:id/candidates/registerable — bulk-register roster +
// capacity for the pre-flight preview (exams.view).
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
    return NextResponse.json(await examCandidateAdminReadService.getRegisterable(context, id));
  } catch (err) {
    return mapExaminationError(err);
  }
}
