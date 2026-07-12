import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examinationBulkService } from "@/modules/examinations/services/admin/examination-bulk.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/attendance/mark-all — mark EVERY registered
// candidate in the session in one status (default PRESENT), server-side over the whole
// set (not the UI's loaded page). One request → one tx per item → BulkSummary.
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
    const body = (await req.json().catch(() => ({}))) as { status?: string };
    const summary = await examinationBulkService.markAllAttendance(context, id, body.status);
    return NextResponse.json(summary);
  } catch (err) {
    return mapExaminationError(err);
  }
}
