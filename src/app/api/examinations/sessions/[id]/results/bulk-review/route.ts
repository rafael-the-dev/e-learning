import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examinationBulkService } from "@/modules/examinations/services/admin/examination-bulk.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/results/bulk-review — review many SUBMITTED results
// (exams.reviewResults). Body: { examResultIds?: string[], allMatching?: boolean }.
// RESULT_NOT_SUBMITTED is skipped; SELF_REVIEW_NOT_ALLOWED / MARKER_REQUIRED stay failed
// (separation of duties is preserved, never hidden).
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
    const summary = await examinationBulkService.bulkReviewResults(context, id, body);
    return NextResponse.json(summary);
  } catch (err) {
    return mapExaminationError(err);
  }
}
