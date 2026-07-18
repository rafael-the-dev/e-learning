import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { AppealDetailView } from "@/modules/student-examinations/components/appeal-detail-view";

export const metadata = { title: "Exames · Recurso" };

export default async function StudentExamAppealDetailPage({
  params,
}: {
  params: Promise<{ appealId: string }>;
}) {
  const { appealId } = await params;
  // studentId is NEVER read from the URL — resolved server-side from the session.
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  // Ownership is enforced server-side → an appeal that is not this student's own
  // returns null → notFound().
  const appeal = await studentExaminationService.getAppealDetail(
    context.organizationId,
    student.id,
    appealId
  );
  if (!appeal) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/student/examinations/appeals">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
      </Button>
      <AppealDetailView appeal={appeal} />
    </div>
  );
}
