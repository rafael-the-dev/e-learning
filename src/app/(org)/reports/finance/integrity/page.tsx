import Link from "next/link";
import {
  ChevronLeft, ShieldAlert, ShieldCheck, AlertTriangle, Info, CheckCircle,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { getIntegrityReportKPIs } from "@/modules/reports/finance/repositories/integrity-report.repository";
import { IntegrityIssuesTable } from "@/modules/reports/finance/components/integrity-issues-table";
import type { IntegrityReportFilters } from "@/modules/reports/finance/types";
import { INTEGRITY_SEVERITY_LABELS, INTEGRITY_CATEGORY_LABELS, INTEGRITY_STATUS_LABELS } from "@/modules/finance/types";

export const metadata = { title: "Problemas de Integridade" };

const ENTITY_TYPES = ["Invoice", "Payment", "Receipt", "Refund", "Installment", "StudentWallet"];

const CATEGORIES = [
  "INVOICE_BALANCE",
  "INSTALLMENT_BALANCE",
  "PAYMENT_ALLOCATION",
  "WALLET_BALANCE",
  "REFUND_TOTAL",
  "RECEIPT_INTEGRITY",
  "ORPHAN_RECORD",
  "LEDGER_CONSISTENCY",
];

const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "SUPPRESSED"];

async function checkCanResolve(userId: string, organizationId: string) {
  const perms = await getUserPermissions(userId, organizationId);
  return createAbility(perms).can(PERMISSIONS.INTEGRITY_ISSUES_RESOLVE);
}

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const branches = await db.branch.findMany({
    where: { organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { branches };
}

export default async function IntegrityReportPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_INTEGRITY);
  const { organizationId, userId } = context;

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.pageSize ?? "20", 10)));

  const filters: IntegrityReportFilters = {
    organizationId,
    page,
    pageSize,
    severity: searchParams.severity,
    category: searchParams.category,
    entityType: searchParams.entityType,
    status: searchParams.status,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
  };

  const [kpis, canResolve] = await Promise.all([
    getIntegrityReportKPIs(organizationId),
    checkCanResolve(userId, organizationId),
  ]);

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
        title="Problemas de Integridade"
        description="Inconsistências detectadas pelo motor de verificação financeira."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
      />
      <div className="p-8 space-y-6">
        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          <StatCard
            title="Crítico"
            value={kpis.openCritical}
            icon={<ShieldAlert className="size-4" />}
            description="abertos"
          />
          <StatCard
            title="Alto"
            value={kpis.openHigh}
            icon={<AlertTriangle className="size-4" />}
            description="abertos"
          />
          <StatCard
            title="Médio"
            value={kpis.openMedium}
            icon={<Info className="size-4" />}
            description="abertos"
          />
          <StatCard
            title="Baixo"
            value={kpis.openLow}
            icon={<Info className="size-4" />}
            description="abertos"
          />
          <StatCard
            title="Total em Aberto"
            value={kpis.totalOpen}
            icon={<ShieldAlert className="size-4" />}
          />
          <StatCard
            title="Resolvidos"
            value={kpis.totalResolved}
            icon={<ShieldCheck className="size-4" />}
            description="total"
          />
        </div>

        {/* Filters */}
        <form method="GET" className="flex flex-wrap gap-3 items-end bg-muted/30 rounded-lg p-4 border">
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Severidade</label>
            <select name="severity" defaultValue={filters.severity ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todas</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{INTEGRITY_SEVERITY_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-44">
            <label className="text-xs font-medium text-muted-foreground">Categoria</label>
            <select name="category" defaultValue={filters.category ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todas</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{INTEGRITY_CATEGORY_LABELS[c] ?? c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Tipo de Entidade</label>
            <select name="entityType" defaultValue={filters.entityType ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {ENTITY_TYPES.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-32">
            <label className="text-xs font-medium text-muted-foreground">Estado</label>
            <select name="status" defaultValue={filters.status ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Abertos + Reconhecidos</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{INTEGRITY_STATUS_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Detectado De</label>
            <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Detectado Até</label>
            <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <Button type="submit" size="sm">Filtrar</Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/reports/finance/integrity">Limpar</Link>
          </Button>
        </form>

        <IntegrityIssuesTable queryString={queryString} canResolve={canResolve} />
      </div>
    </div>
  );
}
