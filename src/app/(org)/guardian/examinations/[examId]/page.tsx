import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { guardianExaminationService } from "@/modules/guardian-examinations/services/guardian-examination.service";
import { GuardianExamDetailView } from "@/modules/guardian-examinations/components/guardian-exam-detail-view";

export const metadata = { title: "Detalhes do Exame" };

// Guardian Examination Portal — Exam Detail (supervision, READ-ONLY).
// examId = examCandidateId. guardianUserId is ALWAYS context.userId, never the URL.
export default async function GuardianExamDetailPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  const context = await requirePermissionOrRedirect(PERMISSIONS.GUARDIAN_PORTAL_VIEW);

  // Fail-closed: null covers not-linked / other-org / inactive-link / canViewAcademic=false.
  const detail = await guardianExaminationService.getExamDetail(
    context.organizationId,
    context.userId,
    examId
  );
  if (!detail) notFound();

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/guardian/examinations">
          <ArrowLeft className="size-4" /> Voltar
        </Link>
      </Button>
      <GuardianExamDetailView detail={detail} />
    </div>
  );
}
