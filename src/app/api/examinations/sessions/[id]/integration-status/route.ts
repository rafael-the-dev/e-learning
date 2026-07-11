import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examIntegrationAdminReadService } from "@/modules/examinations/services/admin/exam-integration-admin-read.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions/:id/integration-status — per-result grade state (exams.view).
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
    return NextResponse.json(await examIntegrationAdminReadService.getIntegrationStatus(context, id));
  } catch (err) {
    return mapExaminationError(err);
  }
}
