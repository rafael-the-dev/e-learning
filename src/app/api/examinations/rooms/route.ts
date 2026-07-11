import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examRoomAdminReadService } from "@/modules/examinations/services/admin/exam-room-admin-read.service";
import { CreateExamRoomCommand } from "@/modules/examinations/commands/exam-room.commands";
import { mapExaminationError, parseExamRoomListFilters } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/rooms — org-scoped room list (exams.view).
// POST /api/examinations/rooms — create a room (exams.schedule).
export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const filters = parseExamRoomListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await examRoomAdminReadService.list(context, filters));
  } catch (err) {
    return mapExaminationError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new CreateExamRoomCommand(
      {
        name: body.name as string,
        code: body.code as string | undefined,
        capacity: body.capacity as number,
        branchId: body.branchId as string | undefined,
        description: body.description as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapExaminationError(err);
  }
}
