import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { ExamDetailView } from "@/modules/student-examinations/components/exam-detail-view";

export const metadata = { title: "Detalhes do Exame" };

export default async function StudentExamDetailPage({
  params,
}: {
  // The route param is the examCandidateId (the student's own candidacy).
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  // Ownership is enforced server-side: a candidacy that is not this student's own
  // returns null → notFound().
  const exam = await studentExaminationService.getExamDetail(
    context.organizationId,
    student.id,
    examId
  );
  if (!exam) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/student/examinations/upcoming">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
      </Button>
      <ExamDetailView exam={exam} />
    </div>
  );
}
