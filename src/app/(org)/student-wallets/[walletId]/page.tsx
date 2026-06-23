import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getWalletById, getTransactionsByWallet } from "@/modules/wallets/services/wallet.service";
import { WalletTransactionsTable } from "@/modules/wallets/components/wallet-transactions-table";
import { DepositDrawer } from "@/modules/wallets/components/deposit-drawer";
import { ApplyCreditDrawer } from "@/modules/wallets/components/apply-credit-drawer";
import { AdjustmentDrawer } from "@/modules/wallets/components/adjustment-drawer";
import { WALLET_STATUS_LABELS } from "@/modules/wallets/types";
import { findInvoicesByOrganization } from "@/modules/finance/repositories/invoice.repository";
import { normalizePaginationParams } from "@/shared/lib/pagination";

export const metadata = { title: "Carteira" };

interface SearchParams {
  page?: string;
  type?: string;
}

export default async function WalletDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ walletId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.WALLETS_VIEW);

  const { walletId } = await params;
  const wallet = await getWalletById(walletId, context.organizationId).catch(() => null);
  if (!wallet) notFound();

  const sp = await searchParams;
  const pagination = normalizePaginationParams(sp.page, 20);

  const [transactions, invoicesResult] = await Promise.all([
    getTransactionsByWallet(walletId, context.organizationId, {
      ...pagination,
      type: sp.type,
    }),
    findInvoicesByOrganization(context.organizationId, {
      page: 1,
      pageSize: 100,
      studentId: wallet.studentId,
      status: "PENDING",
    }),
  ]);

  const pendingInvoices = [
    ...invoicesResult.data,
    ...(await findInvoicesByOrganization(context.organizationId, {
      page: 1,
      pageSize: 100,
      studentId: wallet.studentId,
      status: "PARTIALLY_PAID",
    })).data,
  ].map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    balanceAmount: inv.balanceAmount,
  }));

  const canDeposit = context.ability.can(PERMISSIONS.WALLET_TRANSACTIONS_DEPOSIT);
  const canApplyCredit = context.ability.can(PERMISSIONS.WALLET_TRANSACTIONS_APPLY_CREDIT);
  const canAdjust = context.ability.can(PERMISSIONS.WALLET_TRANSACTIONS_ADJUST);

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground text-sm">
      <Link href="/student-wallets" className="hover:text-foreground transition-colors">
        Carteiras
      </Link>
      <span>/</span>
      <span className="text-foreground">{wallet.studentName ?? walletId}</span>
    </nav>
  );

  return (
    <>
      <PageHeader
        title={wallet.studentName ?? "Carteira"}
        description={wallet.studentCode ? `#${wallet.studentCode}` : ""}
        breadcrumb={breadcrumb}
        actions={
          <div className="flex items-center gap-2">
            {canDeposit && (
              <DepositDrawer walletId={walletId} studentName={wallet.studentName} />
            )}
            {canApplyCredit && (
              <ApplyCreditDrawer
                walletId={walletId}
                balance={wallet.balance}
                pendingInvoices={pendingInvoices}
              />
            )}
            {canAdjust && <AdjustmentDrawer walletId={walletId} />}
          </div>
        }
      />

      <div className="p-8 space-y-8">
        {/* Balance stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground mb-1">Saldo Disponível</p>
            <p
              className={`text-2xl font-bold tabular-nums ${
                wallet.balance < 0 ? "text-destructive" : ""
              }`}
            >
              {wallet.balance.toLocaleString("pt-PT", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>

          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground mb-1">Estado</p>
            <Badge variant={wallet.status === "SUSPENDED" ? "destructive" : "default"}>
              {WALLET_STATUS_LABELS[wallet.status] ?? wallet.status}
            </Badge>
          </div>

          <div className="rounded-xl border p-5">
            <p className="text-sm text-muted-foreground mb-1">Criada em</p>
            <p className="font-medium">{wallet.createdAt.toLocaleDateString("pt-PT")}</p>
          </div>
        </div>

        {/* Transactions */}
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Histórico de Transações</h2>
          <WalletTransactionsTable result={transactions} defaultType={sp.type} />
        </div>
      </div>
    </>
  );
}
