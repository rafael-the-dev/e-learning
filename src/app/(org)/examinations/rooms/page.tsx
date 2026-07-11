import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { Button } from "@/shared/components/ui/button";
import { examRoomAdminReadService } from "@/modules/examinations/services/admin/exam-room-admin-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { RoomsTable } from "@/modules/examinations/components/rooms-table";
import { RoomFormDialog } from "@/modules/examinations/components/room-form-dialog";
import { ExaminationFilterBar } from "@/modules/examinations/components/examination-filter-bar";
import { getStatusOptions } from "@/modules/examinations/components/status-badges";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";

export const metadata = { title: "Exames — Salas" };

export default async function ExamRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; branchId?: string; search?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  const sp = await searchParams;
  const result = await examRoomAdminReadService.list(context, {
    page: sp.page ? Number(sp.page) : undefined,
    status: sp.status,
    branchId: sp.branchId,
    search: sp.search,
  });
  const canManage = createAbility(await getUserPermissions(context.userId, context.organizationId)).can(
    PERMISSIONS.EXAMS_SCHEDULE
  );

  return (
    <div className="space-y-4">
      <ExaminationPageHeader
        title="Salas de Exame"
        description="Gerir as salas usadas nas sessões de exame."
        actions={
          canManage ? (
            <RoomFormDialog mode="create" trigger={<Button size="sm">Nova sala</Button>} />
          ) : undefined
        }
      />
      <ExaminationFilterBar
        searchPlaceholder="Pesquisar por nome ou código…"
        selects={[{ param: "status", label: "Estado", options: getStatusOptions("room") }]}
      />
      <RoomsTable items={result.items} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}
