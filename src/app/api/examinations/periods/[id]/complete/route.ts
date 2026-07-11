import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { CompleteExamPeriodCommand } from "@/modules/examinations/commands/exam-period.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/periods/:id/complete — LOCKED → COMPLETED (exams.schedule).
export async function POST(
  _req: Request,
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
    return NextResponse.json(await new CompleteExamPeriodCommand({ periodId: id }, context).run());
  } catch (err) {
    return mapExaminationError(err);
  }
}
