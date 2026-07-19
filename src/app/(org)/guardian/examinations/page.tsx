import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { guardianExaminationService } from "@/modules/guardian-examinations/services/guardian-examination.service";
import { GuardianUnlinkedState } from "@/modules/guardian-examinations/components/guardian-unlinked-state";
import { GuardianStudentExamCard } from "@/modules/guardian-examinations/components/guardian-student-exam-card";

export const metadata = { title: "Exames — Resumo" };

// Guardian Examination Portal — Resumo (supervision, READ-ONLY).
// guardianUserId is ALWAYS context.userId (the authenticated user), never the URL.
export default async function GuardianExaminationsOverviewPage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.GUARDIAN_PORTAL_VIEW);
  const overview = await guardianExaminationService.getOverview(
    context.organizationId,
    context.userId
  );

  // Blocked state — no ACTIVE links to any educando.
  if (!overview.hasLinks) {
    return <GuardianUnlinkedState />;
  }

  // The service already returns students primary-first.
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {overview.students.map((summary) => (
        <GuardianStudentExamCard key={summary.student.studentId} summary={summary} />
      ))}
    </div>
  );
}
