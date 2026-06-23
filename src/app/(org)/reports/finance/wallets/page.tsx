import Link from "next/link";
import {
  ChevronLeft, Wallet, Users, TrendingUp, TrendingDown, CreditCard, RefreshCcw,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getWalletActivityReport } from "@/modules/reports/finance/services/financial-reports.service";
import { WalletActivityTable } from "@/modules/reports/finance/components/wallet-activity-table";
import { WalletActivityCharts } from "@/modules/reports/finance/components/wallet-activity-charts";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import { WALLET_TRANSACTION_TYPE_LABELS } from "@/modules/finance/types";
import type { WalletActivityFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Extrato de Carteiras" };

const WALLET_TYPES = ["DEPOSIT", "OVERPAYMENT", "PROMOTIONAL_CREDIT", "ADJUSTMENT", "CREDIT_APPLIED", "REFUND"];

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const branches = await db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { branches };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

export default async function WalletsPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: WalletActivityFilters = {
    organizationId,
    page,
    pageSize,
    studentId: searchParams.studentId,
    branchId: searchParams.branchId,
    transactionType: searchParams.transactionType,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    minBalance: searchParams.minBalance ? parseFloat(searchParams.minBalance) : undefined,
    search: searchParams.search,
  };

  const [report, filterOptions, criticalCount] = await Promise.all([
    getWalletActivityReport(filters),
    getFilterOptions(organizationId),
    getCriticalCount(organizationId),
  ]);

  const { kpis, typeBreakdown, monthlyTrend } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      transactionType: filters.transactionType,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      minBalance: filters.minBalance != null ? String(filters.minBalance) : undefined,
      search: filters.search,
    }).filter(([, v]) => v != null)
  ) as Record<string, string>;

  const queryParams = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && k !== "organizationId" && k !== "page" && k !== "pageSize") {
      queryParams.set(k, String(v));
    }
  }
  const queryString = queryParams.toString();

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Extrato de Carteiras"
        description="Saldos e movimentos das carteiras dos alunos."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="wallets" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Saldo Total em Carteiras"
            value={`${kpis.totalWalletBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<Wallet className="size-4" />}
          />
          <StatCard
            title="Alunos com Saldo Positivo"
            value={kpis.studentsWithPositiveBalance}
            icon={<Users className="size-4" />}
          />
          <StatCard
            title="Créditos no Período"
            value={`${kpis.creditsThisPeriod.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<TrendingUp className="size-4" />}
          />
          <StatCard
            title="Débitos no Período"
            value={`${kpis.debitsThisPeriod.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<TrendingDown className="size-4" />}
          />
          <StatCard
            title="Crédito Aplicado"
            value={`${kpis.creditAppliedThisPeriod.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<CreditCard className="size-4" />}
            description="no período"
          />
          <StatCard
            title="Reembolsos para Carteira"
            value={`${kpis.walletRefundsThisPeriod.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`}
            icon={<RefreshCcw className="size-4" />}
            description="no período"
          />
        </div>

        {/* Filters */}
        <form method="GET" className="flex flex-wrap gap-3 items-end bg-muted/30 rounded-lg p-4 border">
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Filial</label>
            <select name="branchId" defaultValue={filters.branchId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todas</option>
              {filterOptions.branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Transacção</label>
            <select name="transactionType" defaultValue={filters.transactionType ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {WALLET_TYPES.map((t) => (
                <option key={t} value={t}>{WALLET_TRANSACTION_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data De</label>
            <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data Até</label>
            <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1 min-w-28">
            <label className="text-xs font-medium text-muted-foreground">Saldo Mín.</label>
            <input
              type="number"
              name="minBalance"
              defaultValue={filters.minBalance ?? ""}
              min={0}
              step={0.01}
              placeholder="0.00"
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Pesquisar</label>
            <input type="text" name="search" defaultValue={filters.search ?? ""} placeholder="Nome, código..." className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/wallets">Limpar</Link>
          </Button>
        </form>

        {/* Charts */}
        <WalletActivityCharts typeBreakdown={typeBreakdown} monthlyTrend={monthlyTrend} />

        {/* Table */}
        <WalletActivityTable queryString={queryString} />
      </div>
    </div>
  );
}
