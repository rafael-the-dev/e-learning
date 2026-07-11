import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examinationOperationsReadService } from "@/modules/examinations/services/admin/examination-operations-read.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/operations/conflicts — detection only (exams.operationsView).
export async function GET(): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await examinationOperationsReadService.getConflicts(context));
  } catch (err) {
    return mapExaminationError(err);
  }
}
