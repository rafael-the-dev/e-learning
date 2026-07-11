import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examinationAdminOverviewService } from "@/modules/examinations/services/admin/examination-admin-overview.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/operations/overview — admin dashboard KPIs (exams.view).
export async function GET(): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await examinationAdminOverviewService.getOverview(context));
  } catch (err) {
    return mapExaminationError(err);
  }
}
