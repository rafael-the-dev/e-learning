import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getInvoicesByOrganization, getInvoiceStats } from "@/modules/finance/services/invoice.service";
import { InvoicesTable } from "@/modules/finance/components/invoices-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { Plus } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Faturas" };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.INVOICES_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.INVOICES_CREATE);
  const canCancel = ability.can(PERMISSIONS.INVOICES_CANCEL);

  const [result, stats] = await Promise.all([
    getInvoicesByOrganization(context.organizationId, { ...pagination, search, status }),
    getInvoiceStats(context.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title="Faturas"
        description="Gestão de faturas e cobranças de alunos."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/invoices/new">
                <Plus className="size-4 mr-1.5" />
                Nova Fatura
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Pendente" value={stats["PENDING"] ?? 0} />
          <StatCard title="Parcialmente Pago" value={stats["PARTIALLY_PAID"] ?? 0} />
          <StatCard title="Pago" value={stats["PAID"] ?? 0} />
          <StatCard title="Em Atraso" value={stats["OVERDUE"] ?? 0} />
        </div>

        <InvoicesTable
          result={result}
          defaultSearch={search}
          defaultStatus={status}
          canCancel={canCancel}
        />
      </div>
    </>
  );
}
