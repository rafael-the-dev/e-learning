import Link from "next/link";
import {
  FileText, Clock, CreditCard, RefreshCcw, User, Wallet, TrendingUp, ShieldAlert,
  Users, ListChecks, GitBranch, BookOpen, Scale, ClipboardCheck, BarChart3, PiggyBank, Receipt, TrendingDown, Banknote, Activity,
} from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getDb } from "@/server/db";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";

export const metadata = { title: "Relatórios Financeiros" };

interface ReportCard {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  available: boolean;
}

async function getCriticalIntegrityCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

export default async function FinanceReportsHomePage() {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_VIEW);

  const criticalCount = await getCriticalIntegrityCount(context.organizationId);

  const reports: ReportCard[] = [
    {
      title: "Contas a Receber",
      description: "Quem deve dinheiro? Quanto? Desde quando? Por curso e filial.",
      href: "/reports/finance/accounts-receivable",
      icon: <FileText className="size-5" />,
      available: true,
    },
    {
      title: "Análise de Aging",
      description: "Antiguidade da dívida por escalão: corrente, 1–30, 31–60, 61–90 e 90+ dias.",
      href: "/reports/finance/aging",
      icon: <Clock className="size-5" />,
      available: true,
    },
    {
      title: "Relatório de Pagamentos",
      description: "Quanto foi recebido? Por método? Por filial? Por período?",
      href: "/reports/finance/payments",
      icon: <CreditCard className="size-5" />,
      available: true,
    },
    {
      title: "Relatório de Reembolsos",
      description: "Quanto foi reembolsado? A quem? Porquê? Por que método?",
      href: "/reports/finance/refunds",
      icon: <RefreshCcw className="size-5" />,
      available: true,
    },
    {
      title: "Extrato Financeiro do Aluno",
      description: "Histórico financeiro completo de um aluno: faturas, pagamentos, recibos, carteira e reembolsos.",
      href: "/reports/finance/student-statement",
      icon: <User className="size-5" />,
      available: true,
    },
    {
      title: "Dívida de Alunos",
      description: "Vista consolidada por aluno — quem deve mais e há quanto tempo.",
      href: "/reports/finance/student-debt",
      icon: <Users className="size-5" />,
      available: true,
    },
    {
      title: "Cobranças / Prestações",
      description: "Painel operacional de cobranças — prestações vencidas e a vencer.",
      href: "/reports/finance/collections",
      icon: <ListChecks className="size-5" />,
      available: true,
    },
    {
      title: "Receita por Filial",
      description: "Comparação de receita, cobrança e dívida entre filiais.",
      href: "/reports/finance/branch-revenue",
      icon: <GitBranch className="size-5" />,
      available: true,
    },
    {
      title: "Receita por Curso",
      description: "Desempenho financeiro por curso — receita, cobrança e dívida.",
      href: "/reports/finance/course-revenue",
      icon: <BookOpen className="size-5" />,
      available: true,
    },
    {
      title: "Extrato de Carteiras",
      description: "Saldos e movimentos das carteiras dos alunos.",
      href: "/reports/finance/wallets",
      icon: <Wallet className="size-5" />,
      available: true,
    },
    {
      title: "Passivo de Carteiras",
      description: "Crédito acumulado em carteiras de alunos e exposição financeira da organização.",
      href: "/reports/finance/wallet-liability",
      icon: <PiggyBank className="size-5" />,
      available: true,
    },
    {
      title: "Tendência de Receita",
      description: "Evolução mensal entre facturação, cobrança e reembolsos — crescimento e lacunas de cobrança.",
      href: "/reports/finance/revenue-trend",
      icon: <BarChart3 className="size-5" />,
      available: true,
    },
    {
      title: "Relatório de Impostos",
      description: "Imposto cobrado e exposição fiscal por período, regra fiscal, filial e fatura.",
      href: "/reports/finance/taxes",
      icon: <Receipt className="size-5" />,
      available: true,
    },
    {
      title: "Descontos e Fuga de Receita",
      description: "Análise de descontos aplicados, receita sacrificada e impacto por curso, filial e regra.",
      href: "/reports/finance/discounts",
      icon: <TrendingDown className="size-5" />,
      available: true,
    },
    {
      title: "Mix de Métodos de Pagamento",
      description: "Como o dinheiro entra na organização — por método, filial e mês. Identifica filiais dependentes de numerário.",
      href: "/reports/finance/payment-methods",
      icon: <Banknote className="size-5" />,
      available: true,
    },
    {
      title: "Análise de Reembolsos",
      description: "Tendências, exposição financeira e desempenho operacional dos reembolsos.",
      href: "/reports/finance/refund-analysis",
      icon: <Activity className="size-5" />,
      available: true,
    },
    {
      title: "Fluxo de Caixa",
      description: "Entradas e saídas de caixa por período. Baseado no livro-razão financeiro.",
      href: "/reports/finance/cash-flow",
      icon: <TrendingUp className="size-5" />,
      available: true,
    },
    {
      title: "Problemas de Integridade",
      description: "Inconsistências detectadas pelo motor de verificação financeira.",
      href: "/reports/finance/integrity",
      icon: <ShieldAlert className="size-5" />,
      badge: criticalCount > 0 ? `${criticalCount} crítico${criticalCount > 1 ? "s" : ""}` : undefined,
      available: true,
    },
    {
      title: "Reconciliação Financeira",
      description: "Compara o livro-razão com as entidades de origem e calcula divergências, em tempo real, para auditoria.",
      href: "/reports/finance/reconciliation",
      icon: <Scale className="size-5" />,
      available: true,
    },
    {
      title: "Fecho Financeiro",
      description: "Visão executiva de integridade, reconciliação, caixa, recebíveis e passivos financeiros.",
      href: "/reports/finance/closing",
      icon: <ClipboardCheck className="size-5" />,
      available: true,
    },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Relatórios Financeiros"
        description="Visibilidade financeira, exportações e relatórios operacionais."
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reports.map((report) => (
            <Card
              key={report.href}
              className={`transition-shadow ${report.available ? "hover:shadow-md cursor-pointer" : "opacity-60"}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">{report.icon}</div>
                  {report.badge && (
                    <Badge variant={report.badge.includes("crítico") ? "destructive" : "secondary"} className="text-[10px]">
                      {report.badge}
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-sm font-semibold mt-2">{report.title}</CardTitle>
                <CardDescription className="text-xs">{report.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {report.available ? (
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={report.href}>Abrir Relatório</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    Indisponível
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
