import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { teacherExaminationService } from "@/modules/teacher-examinations/services/teacher-examination.service";
import { mapExaminationError } from "@/modules/examinations/lib/portal-http";

// =============================================================================
// GET /api/teacher/examinations/sessions/:sessionId/candidates
// -----------------------------------------------------------------------------
// The attendance ROSTER for a session the teacher is assigned to — used by the
// attendance UI to revalidate after each mutation with fresh capabilities/progress.
// This is a READ, so the endpoint enforces the teacher scope itself: teacherId is
// resolved server-side; a session the teacher is not assigned to returns 404 (fail
// closed — never leaks another session's roster). Never accepts a teacherId.
// =============================================================================

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

    const view = await teacherExaminationService.getSessionAttendanceView(
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
