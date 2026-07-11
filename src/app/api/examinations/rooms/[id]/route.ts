import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examRoomAdminReadService } from "@/modules/examinations/services/admin/exam-room-admin-read.service";
import { UpdateExamRoomCommand } from "@/modules/examinations/commands/exam-room.commands";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/rooms/:id — room detail + allowedActions (exams.view).
// PATCH /api/examinations/rooms/:id — update room metadata (exams.schedule).
export async function GET(
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
    const detail = await examRoomAdminReadService.getDetail(context, id);
    if (!detail) return NextResponse.json({ error: "Recurso não encontrado" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    return mapExaminationError(err);
  }
}

export async function PATCH(
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
    const result = await new UpdateExamRoomCommand(
      {
        roomId: id,
        name: body.name as string | undefined,
        code: body.code as string | undefined,
        capacity: body.capacity as number | undefined,
        description: body.description as string | undefined,
        status: body.status as "ACTIVE" | "INACTIVE" | undefined,
      },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapExaminationError(err);
  }
}
