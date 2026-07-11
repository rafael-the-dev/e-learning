import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examPublicationAdminReadService } from "@/modules/examinations/services/admin/exam-publication-admin-read.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions/:id/publication — publication state + readiness (exams.view).
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
    return NextResponse.json(await examPublicationAdminReadService.getDetail(context, id));
  } catch (err) {
    return mapExaminationError(err);
  }
}
