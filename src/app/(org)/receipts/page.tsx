import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getReceiptsByOrganization, getReceiptStats } from "@/modules/finance/services/receipt.service";
import { ReceiptsTable } from "@/modules/finance/components/receipts-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";

export const metadata = { title: "Recibos" };

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.RECEIPTS_VIEW);
  // A student-scoped user sees only their own receipts, on /student — never this
  // org-wide finance list. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const [result, stats] = await Promise.all([
    getReceiptsByOrganization(context.organizationId, { ...pagination, search, status }),
    getReceiptStats(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Recibos"
        description="Recibos emitidos para pagamentos confirmados."
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Emitidos" value={stats["ISSUED"] ?? 0} />
          <StatCard title="Cancelados" value={stats["CANCELLED"] ?? 0} />
        </div>

        <ReceiptsTable
          result={result}
          defaultSearch={search}
          defaultStatus={status}
        />
      </div>
    </>
  );
}
