import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { examPeriodAdminReadService } from "@/modules/examinations/services/admin/exam-period-admin-read.service";
import { CreateExamPeriodCommand } from "@/modules/examinations/commands/exam-period.commands";
import { mapExaminationError, parseExamPeriodListFilters } from "@/modules/examinations/lib/portal-http";

// GET /api/examinations/periods — org-scoped, paginated period list (exams.view).
// POST /api/examinations/periods — create a DRAFT period (exams.schedule).
// Thin transport shells: auth + delegate; the read service / command own the rules.

export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const filters = parseExamPeriodListFilters(new URL(req.url).searchParams);
    return NextResponse.json(await examPeriodAdminReadService.list(context, filters));
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
    const result = await new CreateExamPeriodCommand(
      {
        name: body.name as string,
        academicYear: body.academicYear as string,
        term: body.term as string | undefined,
        startsAt: body.startsAt as string,
        endsAt: body.endsAt as string,
        branchId: body.branchId as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapExaminationError(err);
  }
}
