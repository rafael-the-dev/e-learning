import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { ArchiveExamRoomCommand } from "@/modules/examinations/commands/exam-room.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// POST /api/examinations/rooms/:id/archive — archive a room (exams.schedule).
// Blocked by the command when future sessions exist.
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
    return NextResponse.json(await new ArchiveExamRoomCommand({ roomId: id }, context).run());
  } catch (err) {
    return mapExaminationError(err);
  }
}
