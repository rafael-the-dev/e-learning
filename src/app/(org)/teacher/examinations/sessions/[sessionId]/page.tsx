import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getTeacherByUserId } from "@/modules/teachers/services/teacher.service";
import { teacherExaminationService } from "@/modules/teacher-examinations/services/teacher-examination.service";
import { TeacherUnlinkedState } from "@/modules/teacher-examinations/components/teacher-unlinked-state";
import { TeacherSessionDetailView } from "@/modules/teacher-examinations/components/teacher-session-detail-view";

export const metadata = { title: "Detalhe da Sessão" };

export default async function TeacherExamSessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const context = await requirePermissionOrRedirect(PERMISSIONS.TEACHER_PORTAL_VIEW);
  const teacher = await getTeacherByUserId(context.organizationId, context.userId);
  if (!teacher) return <TeacherUnlinkedState />;

  // Assignment is enforced server-side: a session the teacher is not assigned to
  // returns null → notFound() (fail-closed). teacherId is server-resolved.
  const session = await teacherExaminationService.getSessionDetail(
    context.organizationId,
    teacher.id,
    sessionId
  );
  if (!session) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/teacher/examinations/sessions">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
      </Button>
      <TeacherSessionDetailView session={session} />
    </div>
  );
}
