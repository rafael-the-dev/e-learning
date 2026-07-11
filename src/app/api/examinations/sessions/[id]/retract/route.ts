import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { RetractExamSessionPublicationCommand } from "@/modules/examinations/commands/publication.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/sessions/:id/retract — retract the session's publication
// (exams.retractPublication). Blocked by the command once downstream-consumed.
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
    const result = await new RetractExamSessionPublicationCommand(
      { examSessionId: id, publicationId: body.publicationId as string | undefined, reason: body.reason as string },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
