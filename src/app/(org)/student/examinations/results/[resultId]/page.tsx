import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getStudentByUserId } from "@/modules/students/services/student.service";
import { studentExaminationService } from "@/modules/student-examinations/services/student-examination.service";
import { StudentUnlinkedState } from "@/modules/student-examinations/components/student-unlinked-state";
import { ResultDetailView } from "@/modules/student-examinations/components/result-detail-view";

export const metadata = { title: "Exames · Resultado" };

export default async function StudentExamResultDetailPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;
  // studentId is NEVER read from the URL — resolved server-side from the session.
  const context = await requirePermissionOrRedirect(PERMISSIONS.STUDENT_PORTAL_VIEW);
  const student = await getStudentByUserId(context.organizationId, context.userId);
  if (!student) return <StudentUnlinkedState />;

  // Ownership + PUBLISHED-only are enforced server-side → null renders notFound().
  const result = await studentExaminationService.getResultDetail(
    context.organizationId,
    student.id,
    resultId
  );
  if (!result) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/student/examinations/results">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
      </Button>
      <ResultDetailView result={result} />
    </div>
  );
}
