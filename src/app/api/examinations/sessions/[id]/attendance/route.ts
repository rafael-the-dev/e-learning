import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examAttendanceAdminReadService } from "@/modules/examinations/services/admin/exam-attendance-admin-read.service";
import { mapExaminationError, parseExamAttendanceListFilters } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions/:id/attendance — session attendance roster (exams.view).
export async function GET(
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
    const filters = parseExamAttendanceListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await examAttendanceAdminReadService.getRoster(context, id, filters));
  } catch (err) {
    return mapExaminationError(err);
  }
}
