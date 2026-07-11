import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { Button } from "@/shared/components/ui/button";
import { examSessionAdminReadService } from "@/modules/examinations/services/admin/exam-session-admin-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { SessionsTable } from "@/modules/examinations/components/sessions-table";
import { SessionFormDialog } from "@/modules/examinations/components/session-form-dialog";

export const metadata = { title: "Exames — Sessões" };

export default async function ExamSessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; periodId?: string; roomId?: string; search?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  const sp = await searchParams;
  const result = await examSessionAdminReadService.list(context, {
    page: sp.page ? Number(sp.page) : undefined,
    status: sp.status,
    periodId: sp.periodId,
    roomId: sp.roomId,
    search: sp.search,
  });
  const canManage = createAbility(await getUserPermissions(context.userId, context.organizationId)).can(
    PERMISSIONS.EXAMS_SCHEDULE
  );

  return (
    <div className="space-y-4">
      <ExaminationPageHeader
        title="Sessões de Exame"
        description="Gerir as sessões e o seu ciclo de vida."
        actions={canManage ? <SessionFormDialog trigger={<Button size="sm">Nova sessão</Button>} /> : undefined}
      />
      <SessionsTable items={result.items} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}
