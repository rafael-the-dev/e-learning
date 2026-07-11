import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examSessionAdminReadService } from "@/modules/examinations/services/admin/exam-session-admin-read.service";
import { CreateExamSessionCommand } from "@/modules/examinations/commands/exam-session.commands";
import { mapExaminationError, parseExamSessionListFilters } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/sessions — org-scoped, paginated session list (exams.view).
// POST /api/examinations/sessions — create a DRAFT session (exams.schedule).

export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const filters = parseExamSessionListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await examSessionAdminReadService.list(context, filters));
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
    const result = await new CreateExamSessionCommand(
      {
        periodId: body.periodId as string,
        levelSubjectId: body.levelSubjectId as string,
        courseId: body.courseId as string | undefined,
        courseLevelId: body.courseLevelId as string | undefined,
        branchId: body.branchId as string | undefined,
        roomId: body.roomId as string | undefined,
        title: body.title as string | undefined,
        startsAt: body.startsAt as string,
        endsAt: body.endsAt as string,
        capacity: body.capacity as number,
        instructions: body.instructions as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapExaminationError(err);
  }
}
