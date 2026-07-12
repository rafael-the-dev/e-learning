import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { AssignExamInvigilatorCommand } from "@/modules/examinations/commands/assign-exam-invigilator.command";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/invigilators — assign a teacher (or user) to a
// session in a role (exams.schedule). Thin shell over the existing command, which
// guards session state, duplicates and time conflicts. Append-only in v1 (no unassign).
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
    const result = await new AssignExamInvigilatorCommand(
      {
        examSessionId: id,
        teacherId: body.teacherId as string | undefined,
        userId: body.userId as string | undefined,
        role: body.role as string,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapExaminationError(err);
  }
}
