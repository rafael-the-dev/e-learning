import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { ReviewExamResultCommand } from "@/modules/examinations/commands/result-review.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/results/:id/review — SUBMITTED → REVIEWED (exams.reviewResults).
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
    const result = await new ReviewExamResultCommand(
      { examResultId: id, remarks: body.remarks as string | undefined, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
