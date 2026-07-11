import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { Button } from "@/shared/components/ui/button";
import { examPeriodAdminReadService } from "@/modules/examinations/services/admin/exam-period-admin-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { PeriodsTable } from "@/modules/examinations/components/periods-table";
import { PeriodFormDialog } from "@/modules/examinations/components/period-form-dialog";

export const metadata = { title: "Exames — Períodos" };

// Server component: guard + read service → DTOs (with allowedActions) → client table.
export default async function ExamPeriodsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; academicYear?: string; search?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  const sp = await searchParams;
  const result = await examPeriodAdminReadService.list(context, {
    page: sp.page ? Number(sp.page) : undefined,
    status: sp.status,
    academicYear: sp.academicYear,
    search: sp.search,
  });
  const canManage = createAbility(await getUserPermissions(context.userId, context.organizationId)).can(
    PERMISSIONS.EXAMS_SCHEDULE
  );

  return (
    <div className="space-y-4">
      <ExaminationPageHeader
        title="Períodos de Exame"
        description="Gerir os períodos de exame da organização."
        actions={canManage ? <PeriodFormDialog trigger={<Button size="sm">Novo período</Button>} /> : undefined}
      />
      <PeriodsTable
        items={result.items}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </div>
  );
}
