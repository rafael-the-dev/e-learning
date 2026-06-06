import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { StatCard } from "@/shared/components/layout/stat-card";
import { requirePermission } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getPaymentsByOrganization, getPaymentStats } from "@/modules/finance/services/payment.service";
import { getWalletBalancesByStudentIds } from "@/modules/wallets/services/wallet.service";
import { PaymentsTable } from "@/modules/finance/components/payments-table";
import { normalizePaginationParams } from "@/shared/lib/pagination";
import { Plus } from "lucide-react";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Pagamentos" };

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.PAYMENTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { page, search, status } = await searchParams;
  const pagination = normalizePaginationParams(page);

  const perms = await getUserPermissions(context.userId, context.organizationId);
  const ability = createAbility(perms);
  const canCreate = ability.can(PERMISSIONS.PAYMENTS_CREATE);
  const canConfirm = ability.can(PERMISSIONS.PAYMENTS_CONFIRM);
  const canCancel = ability.can(PERMISSIONS.PAYMENTS_CANCEL);
  const canIssueReceipt = ability.can(PERMISSIONS.RECEIPTS_ISSUE);

  const [result, stats] = await Promise.all([
    getPaymentsByOrganization(context.organizationId, { ...pagination, search, status }),
    getPaymentStats(context.organizationId),
  ]);

  // Wallet balances for students with PENDING payments (used in confirmation dialog)
  const pendingStudentIds = [
    ...new Set(
      result.data
        .filter((p) => p.status === "PENDING" && p.studentId != null)
        .map((p) => p.studentId as string)
    ),
  ];
  const walletBalances = await getWalletBalancesByStudentIds(context.organizationId, pendingStudentIds);

  return (
    <>
      <PageHeader
        title="Pagamentos"
        description="Registo e gestão de pagamentos de alunos."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/payments/new">
                <Plus className="size-4 mr-1.5" />
                Registar Pagamento
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard title="Total" value={result.total} />
          <StatCard title="Pendente" value={stats["PENDING"] ?? 0} />
          <StatCard title="Confirmado" value={stats["CONFIRMED"] ?? 0} />
          <StatCard title="Cancelado" value={stats["CANCELLED"] ?? 0} />
        </div>

        <PaymentsTable
          result={result}
          defaultSearch={search}
          defaultStatus={status}
          canConfirm={canConfirm}
          canCancel={canCancel}
          canIssueReceipt={canIssueReceipt}
          walletBalances={walletBalances}
        />
      </div>
    </>
  );
}
