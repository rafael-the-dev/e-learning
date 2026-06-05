import { redirect } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getReceiptsByOrganization, getReceiptStats } from "@/modules/finance/services/receipt.service";
import { ReceiptsTable } from "@/modules/finance/components/receipts-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Recibos" };

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.RECEIPTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

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
