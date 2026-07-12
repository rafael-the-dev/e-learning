import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examinationBulkService, type BulkRegisterInput } from "@/modules/examinations/services/admin/examination-bulk.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/candidates/bulk-register — register many candidates
// in one call (exams.registerCandidates). One request → one tx per item → BulkSummary.
// ALREADY_REGISTERED is skipped; eligibility / capacity / seat blockers stay failed.
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
    const body = (await req.json().catch(() => ({}))) as { items?: BulkRegisterInput[] };
    const summary = await examinationBulkService.bulkRegisterCandidates(context, id, body.items ?? []);
    return NextResponse.json(summary);
  } catch (err) {
    return mapExaminationError(err);
  }
}
