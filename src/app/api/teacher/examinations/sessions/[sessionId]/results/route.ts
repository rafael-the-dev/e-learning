import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { teacherExaminationService } from "@/modules/teacher-examinations/services/teacher-examination.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// GET /api/teacher/examinations/sessions/:sessionId/results — the results roster (per
// candidate + per-candidate result capabilities + session gating) for revalidation
// after each mutation. A READ: the endpoint enforces the teacher scope itself
// (teacherId server-resolved); a session the teacher is not assigned to returns 404
// (fail closed). Exposes NO admin/private fields (no reviewer/approver/markerId).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { sessionId } = await params;
    const teacher = await getTeacherByUserId(context.organizationId, context.userId);
    if (!teacher) return NextResponse.json({ error: "Sem perfil de docente" }, { status: 403 });

    const view = await teacherExaminationService.getSessionResultsView(
      context.organizationId,
      teacher.id,
      sessionId
    );
    if (!view) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
    return NextResponse.json(view);
  } catch (err) {
    return mapExaminationError(err);
  }
}
