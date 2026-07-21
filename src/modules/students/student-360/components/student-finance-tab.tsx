import Link from "next/link";
import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { cn } from "@/shared/lib/utils";
import { StudentWalletCard } from "@/modules/wallets/components/student-wallet-card";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  RECEIPT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
} from "@/modules/finance/types";
import { CircleDollarSign, Receipt as ReceiptIcon, Banknote, Undo2, FileText, Wallet, ChevronLeft, ChevronRight } from "lucide-react";
import type { StudentWallet, WalletTransaction } from "@/modules/wallets/types";
import type { FinanceSection, FinanceTabData } from "@/modules/students/student-360/services/student-360.service";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-PT", { style: "currency", currency: "MZN" });
}
function formatDate(d: Date | null): string {
  return d ? new Date(d).toLocaleDateString("pt-PT") : "—";
}

const SECTION_LABELS: Record<FinanceSection, string> = {
  invoices: "Faturas",
  payments: "Pagamentos",
  receipts: "Recibos",
  refunds: "Reembolsos",
};

interface StudentFinanceTabProps {
  // Page-independent KPI summaries (H1 projections) — null when not authorized.
  billingKpis: { totalInvoiced: number; totalPaid: number; outstandingBalance: number } | null;
  walletKpis: { walletBalance: number; creditApplied: number; totalRefunded: number } | null;
  walletCard: { wallet: StudentWallet | null; recentTransactions: WalletTransaction[] } | null;
  // The active section's server-side page (M2) — null when the section isn't authorized.
  financeData: FinanceTabData | null;
  activeSection: FinanceSection;
  studentId: string;
  canDeposit: boolean;
}

function href(section: FinanceSection, page: number): string {
  return `?tab=finance&financeSection=${section}&page=${page}`;
}

// "A mostrar 21–40 de 126 registos" + Anterior/Seguinte (server navigation, URL-stateful).
function Pager({ section, page }: { section: FinanceSection; page: FinanceTabData["page"] }) {
  if (page.total === 0) return null;
  const from = (page.page - 1) * page.pageSize + 1;
  const to = Math.min(page.page * page.pageSize, page.total);
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground px-1 pt-2">
      <span>
        A mostrar {from}–{to} de {page.total} registo(s)
      </span>
      <div className="flex items-center gap-2">
        <span>Página {page.page} de {page.totalPages}</span>
        <div className="flex items-center gap-1">
          {page.hasPreviousPage ? (
            <Button asChild variant="outline" size="icon" className="size-7">
              <Link href={href(section, page.page - 1)} aria-label="Página anterior"><ChevronLeft className="size-3.5" /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="size-7" disabled aria-label="Página anterior"><ChevronLeft className="size-3.5" /></Button>
          )}
          {page.hasNextPage ? (
            <Button asChild variant="outline" size="icon" className="size-7">
              <Link href={href(section, page.page + 1)} aria-label="Página seguinte"><ChevronRight className="size-3.5" /></Link>
            </Button>
          ) : (
            <Button variant="outline" size="icon" className="size-7" disabled aria-label="Página seguinte"><ChevronRight className="size-3.5" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTable({ data }: { data: FinanceTabData }) {
  if (data.page.data.length === 0) {
    return (
      <EmptyState
        icon={<CircleDollarSign className="size-8" />}
        title={`Sem ${SECTION_LABELS[data.section].toLowerCase()}`}
        description="Não há registos para mostrar nesta secção."
      />
    );
  }
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">{renderHead(data)}</thead>
        <tbody className="divide-y">{renderRows(data)}</tbody>
      </table>
    </div>
  );
}

function renderHead(data: FinanceTabData) {
  const th = "px-3 py-2 text-left text-xs text-muted-foreground";
  const thr = "px-3 py-2 text-right text-xs text-muted-foreground";
  switch (data.section) {
    case "invoices":
      return (<tr><th className={th}>N.º Fatura</th><th className={th}>Emissão</th><th className={th}>Vencimento</th><th className={thr}>Total</th><th className={thr}>Pago</th><th className={thr}>Saldo</th><th className={th}>Estado</th></tr>);
    case "payments":
      return (<tr><th className={th}>N.º Pagamento</th><th className={th}>Data</th><th className={thr}>Valor</th><th className={th}>Método</th><th className={th}>Estado</th></tr>);
    case "receipts":
      return (<tr><th className={th}>N.º Recibo</th><th className={th}>Data</th><th className={thr}>Valor</th><th className={th}>Estado</th></tr>);
    case "refunds":
      return (<tr><th className={th}>N.º Reembolso</th><th className={thr}>Valor</th><th className={th}>Método</th><th className={th}>Estado</th><th className={th}>Solicitado em</th></tr>);
  }
}

function renderRows(data: FinanceTabData) {
  const td = "px-3 py-2";
  const tdr = "px-3 py-2 text-right tabular-nums";
  switch (data.section) {
    case "invoices":
      return data.page.data.map((r) => (
        <tr key={r.invoiceId}>
          <td className={`${td} font-mono text-xs`}>{r.invoiceNumber}</td>
          <td className={td}>{formatDate(r.issueDate)}</td>
          <td className={td}>{formatDate(r.dueDate)}</td>
          <td className={tdr}>{formatCurrency(r.totalAmount)}</td>
          <td className={tdr}>{formatCurrency(r.paidAmount)}</td>
          <td className={tdr}>{formatCurrency(r.balanceAmount)}</td>
          <td className={td}><Badge variant="outline">{INVOICE_STATUS_LABELS[r.status] ?? r.status}</Badge></td>
        </tr>
      ));
    case "payments":
      return data.page.data.map((r) => (
        <tr key={r.paymentId}>
          <td className={`${td} font-mono text-xs`}>{r.paymentNumber}</td>
          <td className={td}>{formatDate(r.paymentDate)}</td>
          <td className={tdr}>{formatCurrency(r.totalAmount)}</td>
          <td className={`${td} text-xs`}>{r.paymentMethods.join(", ") || "—"}</td>
          <td className={td}><Badge variant="outline">{PAYMENT_STATUS_LABELS[r.status] ?? r.status}</Badge></td>
        </tr>
      ));
    case "receipts":
      return data.page.data.map((r) => (
        <tr key={r.receiptId}>
          <td className={`${td} font-mono text-xs`}>{r.receiptNumber}</td>
          <td className={td}>{formatDate(r.issueDate)}</td>
          <td className={tdr}>{formatCurrency(r.amount)}</td>
          <td className={td}><Badge variant="outline">{RECEIPT_STATUS_LABELS[r.status] ?? r.status}</Badge></td>
        </tr>
      ));
    case "refunds":
      return data.page.data.map((r) => (
        <tr key={r.refundId}>
          <td className={`${td} font-mono text-xs`}>{r.refundNumber}</td>
          <td className={tdr}>{formatCurrency(r.amount)}</td>
          <td className={`${td} text-xs`}>{r.refundMethod}</td>
          <td className={td}><Badge variant="outline">{REFUND_STATUS_LABELS[r.status] ?? r.status}</Badge></td>
          <td className={td}>{formatDate(r.requestedAt)}</td>
        </tr>
      ));
  }
}

export function StudentFinanceTab({
  billingKpis,
  walletKpis,
  walletCard,
  financeData,
  activeSection,
  studentId,
  canDeposit,
}: StudentFinanceTabProps) {
  if (!billingKpis && !walletKpis) {
    return (
      <EmptyState
        icon={<CircleDollarSign className="size-8" />}
        title="Sem dados financeiros"
        description="Não foi possível obter o extrato financeiro deste aluno."
      />
    );
  }

  // Sections the viewer may open: billing sections need INVOICES_VIEW, refunds need WALLETS_VIEW.
  const sections: FinanceSection[] = [
    ...(billingKpis ? (["invoices", "payments", "receipts"] as const) : []),
    ...(walletKpis ? (["refunds"] as const) : []),
  ];

  return (
    <div className="space-y-6">
      {/* KPI summary — page-independent aggregations, never summed from the current page. */}
      <ExecutiveKpiGrid>
        {billingKpis && (
          <>
            <StatCard title="Total Faturado" value={formatCurrency(billingKpis.totalInvoiced)} icon={<FileText className="size-4 text-blue-500" />} />
            <StatCard title="Total Pago" value={formatCurrency(billingKpis.totalPaid)} icon={<Banknote className="size-4 text-emerald-500" />} />
            <StatCard title="Saldo em Dívida" value={formatCurrency(billingKpis.outstandingBalance)} icon={<CircleDollarSign className="size-4 text-red-500" />} />
          </>
        )}
        {walletKpis && (
          <>
            <StatCard title="Saldo da Carteira" value={formatCurrency(walletKpis.walletBalance)} icon={<Wallet className="size-4 text-amber-500" />} />
            <StatCard title="Crédito Aplicado" value={formatCurrency(walletKpis.creditApplied)} icon={<ReceiptIcon className="size-4 text-violet-500" />} />
            <StatCard title="Total Reembolsado" value={formatCurrency(walletKpis.totalRefunded)} icon={<Undo2 className="size-4 text-orange-500" />} />
          </>
        )}
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Histórico Financeiro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Section subtabs — one bounded, server-paginated table at a time (M2). */}
          <div className="flex items-center gap-1 border-b overflow-x-auto">
            {sections.map((s) => (
              <Link
                key={s}
                href={href(s, 1)}
                aria-current={s === activeSection ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors",
                  s === activeSection
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {SECTION_LABELS[s]}
              </Link>
            ))}
          </div>

          {financeData ? (
            <>
              <SectionTable data={financeData} />
              <Pager section={financeData.section} page={financeData.page} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">Selecione uma secção.</p>
          )}
        </CardContent>
      </Card>

      {walletCard && (
        <div className="max-w-sm">
          <StudentWalletCard
            wallet={walletCard.wallet}
            recentTransactions={walletCard.recentTransactions}
            canDeposit={canDeposit}
            studentId={studentId}
          />
        </div>
      )}
    </div>
  );
}
