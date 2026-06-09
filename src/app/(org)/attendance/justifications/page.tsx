import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import {
  findJustificationsByOrganization,
} from "@/modules/attendance/repositories/attendance-justification.repository";
import { getJustificationStats } from "@/modules/attendance/services/attendance.service";
import { JustificationsTable } from "@/modules/attendance/components/justifications-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Justificações de Presença" };

export default async function AttendanceJustificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canApprove = ability.can(PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_APPROVE);
  const canReject = ability.can(PERMISSIONS.ATTENDANCE_JUSTIFICATIONS_REJECT);

  const [result, stats] = await Promise.all([
    findJustificationsByOrganization(context.organizationId, {
      ...pagination,
      search,
      status,
    }),
    getJustificationStats(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Justificações de Presença"
        description="Rever e aprovar pedidos de justificação de faltas."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <StatCard title="Pendentes" value={stats["PENDING"] ?? 0} />
          <StatCard title="Aprovadas" value={stats["APPROVED"] ?? 0} />
          <StatCard title="Rejeitadas" value={stats["REJECTED"] ?? 0} />
        </div>

        <JustificationsTable
          result={result}
          defaultSearch={search}
          defaultStatus={status}
          canApprove={canApprove}
          canReject={canReject}
        />
      </div>
    </>
  );
}
