import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { examAppealAdminReadService } from "@/modules/examinations/services/admin/exam-appeal-admin-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { AppealsTable } from "@/modules/examinations/components/appeals-table";
import { ExaminationFilterBar } from "@/modules/examinations/components/examination-filter-bar";
import { getStatusOptions } from "@/modules/examinations/components/status-badges";

export const metadata = { title: "Exames — Recursos" };

export default async function ExamAppealsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; examSessionId?: string; studentId?: string; search?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  const sp = await searchParams;
  const result = await examAppealAdminReadService.list(context, {
    page: sp.page ? Number(sp.page) : undefined,
    status: sp.status,
    examSessionId: sp.examSessionId,
    studentId: sp.studentId,
    search: sp.search,
  });

  return (
    <div className="space-y-4">
      <ExaminationPageHeader title="Recursos de Exame" description="Rever, aprovar ou rejeitar recursos sobre resultados." />
      <ExaminationFilterBar
        showSearch={false}
        selects={[{ param: "status", label: "Estado", options: getStatusOptions("appeal") }]}
      />
      <AppealsTable items={result.items} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}
