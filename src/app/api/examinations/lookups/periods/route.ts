import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examLookupAdminReadService } from "@/modules/examinations/services/admin/exam-lookup-admin-read.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/lookups/periods?q= — exam-period picker source (exams.view).
export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return NextResponse.json({ items: await examLookupAdminReadService.periods(context, q) });
  } catch (err) {
    return mapExaminationError(err);
  }
}
