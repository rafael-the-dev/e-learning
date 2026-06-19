import Link from "next/link";
import {
  ChevronLeft, CheckCircle2, AlertTriangle, FileX, Copy, Unlink, ShieldAlert,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getFinancialReconciliationReport } from "@/modules/reports/finance/services/financial-reports.service";
import { ReconciliationIssuesTable } from "@/modules/reports/finance/components/reconciliation-issues-table";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { INTEGRITY_SEVERITY_LABELS } from "@/modules/finance/types";
import { RECONCILIATION_ISSUE_LABELS } from "@/modules/reports/finance/types";
import type { ReconciliationFilters, ReconciliationIssueType, ReconciliationSeverity } from "@/modules/reports/finance/types";

export const metadata = { title: "Reconciliação Financeira" };

const ENTITY_TYPES = ["Payment", "Refund", "Receipt", "Invoice", "FinancialTransaction"];

const ISSUE_TYPES: ReconciliationIssueType[] = [
  "MISSING_PAYMENT_RECEIVED",
  "MISSING_REFUND_DISBURSED",
  "MISSING_RECEIPT_ISSUED",
  "INVOICE_PAID_AMOUNT_MISMATCH",
  "RECEIPT_AMOUNT_MISMATCH",
  "DUPLICATE_LEDGER_ENTRY",
  "ORPHAN_LEDGER_ENTRY",
];

const SEVERITIES: ReconciliationSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const branches = await db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { branches };
}

export default async function ReconciliationReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_RECONCILIATION);
  const { organizationId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: ReconciliationFilters = {
    organizationId,
    page,
    pageSize,
    branchId: searchParams.branchId,
    studentId: searchParams.studentId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    entityType: searchParams.entityType,
    issueType: searchParams.issueType as ReconciliationIssueType | undefined,
    severity: searchParams.severity as ReconciliationSeverity | undefined,
  };

  const [report, filterOptions] = await Promise.all([
    getFinancialReconciliationReport(filters),
    getFilterOptions(organizationId),
  ]);

  const { kpis, watchlist } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      studentId: filters.studentId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      entityType: filters.entityType,
      issueType: filters.issueType,
      severity: filters.severity,
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
        title="Reconciliação Financeira"
        description="Vista de comparação calculada entre o livro-razão e as entidades de origem — para auditoria, não substitui os Problemas de Integridade."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="reconciliation" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        {/* 1. Summary KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard title="Itens Reconciliados" value={kpis.reconciledItems} icon={<CheckCircle2 className="size-4" />} />
          <StatCard title="Itens com Divergência" value={kpis.mismatchedItems} icon={<AlertTriangle className="size-4" />} />
          <StatCard title="Lançamentos em Falta" value={kpis.missingLedgerEntries} icon={<FileX className="size-4" />} />
          <StatCard title="Lançamentos Duplicados" value={kpis.duplicateLedgerEntries} icon={<Copy className="size-4" />} />
          <StatCard title="Lançamentos Órfãos" value={kpis.orphanLedgerEntries} icon={<Unlink className="size-4" />} />
          <StatCard title="Problemas Críticos" value={kpis.criticalIssues} icon={<ShieldAlert className="size-4" />} />
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
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">ID do Aluno</label>
            <input type="text" name="studentId" defaultValue={filters.studentId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Entidade</label>
            <select name="entityType" defaultValue={filters.entityType ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {ENTITY_TYPES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-56">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Problema</label>
            <select name="issueType" defaultValue={filters.issueType ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {ISSUE_TYPES.map((t) => (
                <option key={t} value={t}>{RECONCILIATION_ISSUE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-28">
            <label className="text-xs font-medium text-muted-foreground">Severidade</label>
            <select name="severity" defaultValue={filters.severity ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todas</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{INTEGRITY_SEVERITY_LABELS[s] ?? s}</option>
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
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/reconciliation">Limpar</Link>
          </Button>
        </form>

        {/* 2. Reconciliation Watchlist */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lista de Vigilância</CardTitle>
            <CardDescription className="text-xs">
              Os {watchlist.length} problemas de severidade Crítica/Alta mais recentes, neste âmbito de filtros.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {watchlist.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum problema crítico ou de alta severidade encontrado.</p>
            ) : (
              <div className="space-y-2">
                {watchlist.map((row, i) => (
                  <div key={`${row.issueType}-${row.entityId}-${i}`} className="flex items-center justify-between gap-3 text-xs border-b last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[row.severity] ?? "outline"} className="text-[10px]">
                        {INTEGRITY_SEVERITY_LABELS[row.severity] ?? row.severity}
                      </Badge>
                      <span className="font-medium">{row.entityType}</span>
                      <span className="font-mono text-muted-foreground">{row.entityReference}</span>
                    </div>
                    <span className="text-muted-foreground">{RECONCILIATION_ISSUE_LABELS[row.issueType]}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Ledger vs Source Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Livro-Razão vs. Tabela de Origem</CardTitle>
            <CardDescription className="text-xs">Todas as divergências detectadas, segundo os filtros activos.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReconciliationIssuesTable queryKey="main" queryString={queryString} pageSize={pageSize} />
          </CardContent>
        </Card>

        {/* 4. Missing Ledger Entries */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lançamentos em Falta</CardTitle>
            <CardDescription className="text-xs">Pagamentos, reembolsos ou recibos sem o lançamento correspondente no livro-razão.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReconciliationIssuesTable
              queryKey="missing"
              queryString={queryString}
              lockedIssueTypes={["MISSING_PAYMENT_RECEIVED", "MISSING_REFUND_DISBURSED", "MISSING_RECEIPT_ISSUED"]}
            />
          </CardContent>
        </Card>

        {/* 5. Duplicate Ledger Entries */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lançamentos Duplicados</CardTitle>
            <CardDescription className="text-xs">
              Mais de um lançamento no livro-razão para a mesma origem e tipo de transacção. Filtro de filial não se aplica — o livro-razão não guarda filial.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReconciliationIssuesTable queryKey="duplicate" queryString={queryString} lockedIssueTypes={["DUPLICATE_LEDGER_ENTRY"]} />
          </CardContent>
        </Card>

        {/* 6. Orphan Financial Transactions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Transacções Financeiras Órfãs</CardTitle>
            <CardDescription className="text-xs">
              Lançamentos no livro-razão sem o registo de origem correspondente. Filtro de filial não se aplica — o livro-razão não guarda filial.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReconciliationIssuesTable queryKey="orphan" queryString={queryString} lockedIssueTypes={["ORPHAN_LEDGER_ENTRY"]} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
