import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examinationBulkService } from "@/modules/examinations/services/admin/examination-bulk.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/integration/bulk — integrate every published result
// of the session that still needs it (exams.integrateResults). One request → one tx per
// item → BulkSummary. Non-scored results are reported as skipped ("Não suportado").
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
    const summary = await examinationBulkService.bulkIntegrateResults(context, id);
    return NextResponse.json(summary);
  } catch (err) {
    return mapExaminationError(err);
  }
}
