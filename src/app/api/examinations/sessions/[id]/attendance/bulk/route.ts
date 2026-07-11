import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkMarkExamAttendanceCommand } from "@/modules/examinations/commands/attendance.commands";
import type { BulkMarkExamAttendanceInput } from "@/modules/examinations/schemas/attendance.schema";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/attendance/bulk — mark many candidates in one
// session in a single request (exams.markAttendance). The command re-checks each item.
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkMarkExamAttendanceCommand(
      {
        examSessionId: id,
        items: body.items as BulkMarkExamAttendanceInput["items"],
        stopOnFailure: body.stopOnFailure as boolean | undefined,
      },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
