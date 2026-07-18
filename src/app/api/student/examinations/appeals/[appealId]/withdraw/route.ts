import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { WithdrawExamAppealCommand } from "@/modules/examinations/commands/appeals.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// =============================================================================
// POST /api/student/examinations/appeals/:appealId/withdraw
// -----------------------------------------------------------------------------
// A student withdraws their OWN PENDING appeal. Delegates to the existing
// WithdrawExamAppealCommand, which resolves the acting Student server-side and
// enforces ownership + status=PENDING (a withdraw is impossible once review opens).
// studentId is never taken from the client. Returns a student-facing DTO only.
// =============================================================================

export async function POST(
  req: Request,
  { params }: { params: Promise<{ appealId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { appealId } = await params;
    const result = await new WithdrawExamAppealCommand({ appealId }, context).run();
    return NextResponse.json({ appealId: result.appealId, status: result.status });
  } catch (err) {
    return mapExaminationError(err);
  }
}
