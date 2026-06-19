import Link from "next/link";
import {
  ChevronLeft, Wallet, Banknote, Smartphone, Landmark, Repeat2, Crown, Calculator, Percent, AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getPaymentMethodMixReport } from "@/modules/reports/finance/services/financial-reports.service";
import { ExportButton } from "@/modules/reports/finance/components/export-button";
import { PaymentMethodMixDonutChart } from "@/modules/reports/finance/components/payment-method-mix-donut-chart";
import { PaymentMethodMonthlyTrendChart } from "@/modules/reports/finance/components/payment-method-monthly-trend-chart";
import { PaymentMethodByBranchChart } from "@/modules/reports/finance/components/payment-method-by-branch-chart";
import { PaymentMethodAvgSplitChart } from "@/modules/reports/finance/components/payment-method-avg-split-chart";
import { PaymentMethodMixTable } from "@/modules/reports/finance/components/payment-method-mix-table";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";
import type { PaymentMethodMixFilters } from "@/modules/reports/finance/types";

export const metadata = { title: "Mix de Métodos de Pagamento" };

const ALLOWED_PAYMENT_STATUSES = ["CONFIRMED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;
const PAYMENT_STATUS_FILTER_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmado",
  PARTIALLY_REFUNDED: "Parcialmente Reembolsado",
  REFUNDED: "Reembolsado",
};

async function getFilterOptions(organizationId: string) {
  const db = await getDb();
  const [branches, courses, academicYears, academicTerms] = await Promise.all([
    db.branch.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.course.findMany({ where: { organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.academicYear.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
    db.academicTerm.findMany({ where: { organizationId }, select: { id: true, name: true }, orderBy: { startDate: "desc" } }),
  ]);
  return { branches, courses, academicYears, academicTerms };
}

function fmtMzn(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

export default async function PaymentMethodMixPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  const { organizationId } = context;

  const filters: PaymentMethodMixFilters = {
    organizationId,
    branchId: searchParams.branchId,
    courseId: searchParams.courseId,
    studentId: searchParams.studentId,
    academicYearId: searchParams.academicYearId,
    academicTermId: searchParams.academicTermId,
    dateFrom: searchParams.dateFrom,
    dateTo: searchParams.dateTo,
    paymentMethod: searchParams.paymentMethod,
    paymentStatus: searchParams.paymentStatus,
  };

  const [report, filterOptions] = await Promise.all([
    getPaymentMethodMixReport(filters),
    getFilterOptions(organizationId),
  ]);

  try {
    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "payment-methods",
      action: "financial_report.viewed",
      newValues: {
        reportType: "payment-methods",
        filters: {
          branchId: filters.branchId,
          courseId: filters.courseId,
          studentId: filters.studentId,
          academicYearId: filters.academicYearId,
          academicTermId: filters.academicTermId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          paymentMethod: filters.paymentMethod,
          paymentStatus: filters.paymentStatus,
        },
      },
    });
  } catch (err) {
    console.error("[payment-methods] audit error (non-fatal):", err);
  }

  const { kpis, rows, monthlyTrend, byBranch, hasCriticalIntegrityIssue } = report;

  const exportFilters = Object.fromEntries(
    Object.entries({
      branchId: filters.branchId,
      courseId: filters.courseId,
      studentId: filters.studentId,
      academicYearId: filters.academicYearId,
      academicTermId: filters.academicTermId,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      paymentMethod: filters.paymentMethod,
      paymentStatus: filters.paymentStatus,
    }).filter(([, v]) => v != null)
  ) as Record<string, string>;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Mix de Métodos de Pagamento"
        description="Como o dinheiro entra na organização — por método, filial e mês."
        breadcrumb={
          <Link href="/reports/finance" className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
            <ChevronLeft className="size-3" /> Relatórios Financeiros
          </Link>
        }
        actions={<ExportButton reportType="payment-methods" filters={exportFilters} />}
      />
      <div className="p-8 space-y-6">
        {hasCriticalIntegrityIssue && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              Existem inconsistências financeiras críticas. Os valores por método de pagamento podem não reflectir a realidade.{" "}
              <Link href="/reports/finance/integrity" className="underline font-medium">
                Ver problemas de integridade
              </Link>
            </AlertDescription>
          </Alert>
        )}

        {/* KPIs */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatCard title="Total Recebido" value={fmtMzn(kpis.totalReceived)} icon={<Wallet className="size-4" />} />
          <StatCard title="Recebido em Numerário" value={fmtMzn(kpis.cashReceived)} icon={<Banknote className="size-4" />} />
          <StatCard title="Recebido Digitalmente" value={fmtMzn(kpis.digitalReceived)} icon={<Smartphone className="size-4" />} />
          <StatCard title="Recebido por Via Bancária" value={fmtMzn(kpis.bankReceived)} icon={<Landmark className="size-4" />} />
          <StatCard
            title="Método Mais Utilizado"
            value={kpis.mostUsedMethod ? (PAYMENT_METHOD_LABELS[kpis.mostUsedMethod] ?? kpis.mostUsedMethod) : "—"}
            icon={<Repeat2 className="size-4" />}
            description="por nº de divisões"
          />
          <StatCard
            title="Método de Maior Valor"
            value={kpis.highestValueMethod ? (PAYMENT_METHOD_LABELS[kpis.highestValueMethod] ?? kpis.highestValueMethod) : "—"}
            icon={<Crown className="size-4" />}
            description="por valor total"
          />
          <StatCard title="Média por Divisão" value={fmtMzn(kpis.averagePaymentSplit)} icon={<Calculator className="size-4" />} />
          <StatCard title="Taxa de Dependência de Numerário" value={`${kpis.cashDependencyRate.toFixed(1)}%`} icon={<Percent className="size-4" />} />
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
          <div className="flex flex-col gap-1 min-w-40">
            <label className="text-xs font-medium text-muted-foreground">Curso</label>
            <select name="courseId" defaultValue={filters.courseId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Método de Pagamento</label>
            <select name="paymentMethod" defaultValue={filters.paymentMethod ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Estado do Pagamento</label>
            <select name="paymentStatus" defaultValue={filters.paymentStatus ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos (excl. pendentes/cancelados)</option>
              {ALLOWED_PAYMENT_STATUSES.map((value) => (
                <option key={value} value={value}>{PAYMENT_STATUS_FILTER_LABELS[value]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">ID do Aluno</label>
            <input type="text" name="studentId" defaultValue={filters.studentId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Ano Académico</label>
            <select name="academicYearId" defaultValue={filters.academicYearId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.academicYears.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-36">
            <label className="text-xs font-medium text-muted-foreground">Período Académico</label>
            <select name="academicTermId" defaultValue={filters.academicTermId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Todos</option>
              {filterOptions.academicTerms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
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
            <Link href="/reports/finance/payment-methods">Limpar</Link>
          </Button>
        </form>

        {/* Full-width chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tendência Mensal por Método</CardTitle>
            <CardDescription className="text-xs">Valor recebido por método de pagamento, mês a mês — acompanha o crescimento dos pagamentos digitais.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethodMonthlyTrendChart rows={monthlyTrend} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Mix de Métodos</CardTitle>
              <CardDescription className="text-xs">Distribuição do valor total recebido por método.</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentMethodMixDonutChart rows={rows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Valor Médio por Método</CardTitle>
              <CardDescription className="text-xs">Total recebido ÷ nº de divisões, por método.</CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentMethodAvgSplitChart rows={rows} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Métodos por Filial</CardTitle>
            <CardDescription className="text-xs">Composição do valor recebido por filial — identifica filiais dependentes de numerário.</CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentMethodByBranchChart rows={byBranch} />
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Detalhe por Método</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentMethodMixTable rows={rows} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
