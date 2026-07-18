import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkMarkExamAttendanceCommand } from "@/modules/examinations/commands/attendance.commands";
import type { BulkMarkExamAttendanceInput } from "@/modules/examinations/schemas/attendance.schema";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// =============================================================================
// POST /api/teacher/examinations/sessions/:sessionId/attendance/bulk
// -----------------------------------------------------------------------------
// Bulk-mark attendance for a set of candidates. Thin shell over the HARDENED bulk
// runner: it delegates to the single Mark command PER ITEM, each re-checking the
// in-tx assignment gate against that item's own session — so a mixed batch can
// never produce an unauthorized write. Duplicates are rejected per item
// (ATTENDANCE_ALREADY_MARKED), so "mark all present" (client sends only pending
// candidates) never overwrites a recorded attendance. Never accepts a teacherId.
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { sessionId } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkMarkExamAttendanceCommand(
      {
        examSessionId: sessionId,
        items: body.items,
        stopOnFailure: body.stopOnFailure,
      } as BulkMarkExamAttendanceInput,
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
