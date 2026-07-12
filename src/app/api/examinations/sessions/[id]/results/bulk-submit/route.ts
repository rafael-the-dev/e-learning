import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examinationBulkService } from "@/modules/examinations/services/admin/examination-bulk.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/results/bulk-submit — submit many DRAFT results
// (exams.submitResults). Body: { examResultIds?: string[], allMatching?: boolean }.
// One request → one tx per item → BulkSummary. RESULT_NOT_DRAFT is skipped; real
// blockers (incomplete / no attendance) stay failed.
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
    const body = (await req.json().catch(() => ({}))) as { examResultIds?: string[]; allMatching?: boolean };
    const summary = await examinationBulkService.bulkSubmitResults(context, id, body);
    return NextResponse.json(summary);
  } catch (err) {
    return mapExaminationError(err);
  }
}
