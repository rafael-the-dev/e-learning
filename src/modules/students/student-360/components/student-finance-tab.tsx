"use client";

import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { StudentWalletCard } from "@/modules/wallets/components/student-wallet-card";
import { PaginatedTable } from "@/modules/students/student-360/components/paginated-table";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  RECEIPT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
} from "@/modules/finance/types";
import {
  CircleDollarSign,
  Receipt as ReceiptIcon,
  Banknote,
  Undo2,
  FileText,
  Wallet,
} from "lucide-react";
import type { StudentFinancialStatement } from "@/modules/reports/finance/types";
import type { StudentWallet, WalletTransaction } from "@/modules/wallets/types";

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-PT", { style: "currency", currency: "MZN" });
}

interface StudentFinanceTabProps {
  statement: StudentFinancialStatement | null;
  wallet: StudentWallet | null;
  recentWalletTransactions: WalletTransaction[];
  canDeposit: boolean;
  studentId: string;
}

export function StudentFinanceTab({
  statement,
  wallet,
  recentWalletTransactions,
  canDeposit,
  studentId,
}: StudentFinanceTabProps) {
  if (!statement) {
    return (
      <EmptyState
        icon={<CircleDollarSign className="size-8" />}
        title="Sem dados financeiros"
        description="Não foi possível obter o extrato financeiro deste aluno."
      />
    );
  }

  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard title="Total Faturado" value={formatCurrency(statement.kpis.totalInvoiced)} icon={<FileText className="size-4 text-blue-500" />} />
        <StatCard title="Total Pago" value={formatCurrency(statement.kpis.totalPaid)} icon={<Banknote className="size-4 text-emerald-500" />} />
        <StatCard title="Saldo em Dívida" value={formatCurrency(statement.kpis.outstandingBalance)} icon={<CircleDollarSign className="size-4 text-red-500" />} />
        <StatCard title="Saldo da Carteira" value={formatCurrency(statement.kpis.walletBalance)} icon={<Wallet className="size-4 text-amber-500" />} />
        <StatCard title="Crédito Aplicado" value={formatCurrency(statement.kpis.creditApplied)} icon={<ReceiptIcon className="size-4 text-violet-500" />} />
        <StatCard title="Total Reembolsado" value={formatCurrency(statement.kpis.totalRefunded)} icon={<Undo2 className="size-4 text-orange-500" />} />
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Faturas</CardTitle></CardHeader>
        <CardContent>
          <PaginatedTable
            data={statement.invoices}
            emptyState={<p className="text-sm text-muted-foreground py-4 text-center">Sem faturas.</p>}
            renderHeader={() => (
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">N.º Fatura</th>
                <th className="px-3 py-2">Emissão</th>
                <th className="px-3 py-2">Vencimento</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Pago</th>
                <th className="px-3 py-2 text-right">Saldo</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            )}
            renderRow={(inv) => (
              <tr key={inv.invoiceId}>
                <td className="px-3 py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="px-3 py-2">{new Date(inv.issueDate).toLocaleDateString("pt-PT")}</td>
                <td className="px-3 py-2">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("pt-PT") : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(inv.totalAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(inv.paidAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(inv.balanceAmount)}</td>
                <td className="px-3 py-2"><Badge variant="outline">{INVOICE_STATUS_LABELS[inv.status] ?? inv.status}</Badge></td>
              </tr>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Pagamentos</CardTitle></CardHeader>
        <CardContent>
          <PaginatedTable
            data={statement.payments}
            emptyState={<p className="text-sm text-muted-foreground py-4 text-center">Sem pagamentos.</p>}
            renderHeader={() => (
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">N.º Pagamento</th>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            )}
            renderRow={(p) => (
              <tr key={p.paymentId}>
                <td className="px-3 py-2 font-mono text-xs">{p.paymentNumber}</td>
                <td className="px-3 py-2">{new Date(p.paymentDate).toLocaleDateString("pt-PT")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(p.totalAmount)}</td>
                <td className="px-3 py-2 text-xs">{p.paymentMethods.join(", ") || "—"}</td>
                <td className="px-3 py-2"><Badge variant="outline">{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</Badge></td>
              </tr>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Recibos</CardTitle></CardHeader>
        <CardContent>
          <PaginatedTable
            data={statement.receipts}
            emptyState={<p className="text-sm text-muted-foreground py-4 text-center">Sem recibos.</p>}
            renderHeader={() => (
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">N.º Recibo</th>
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Estado</th>
              </tr>
            )}
            renderRow={(r) => (
              <tr key={r.receiptId}>
                <td className="px-3 py-2 font-mono text-xs">{r.receiptNumber}</td>
                <td className="px-3 py-2">{new Date(r.issueDate).toLocaleDateString("pt-PT")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                <td className="px-3 py-2"><Badge variant="outline">{RECEIPT_STATUS_LABELS[r.status] ?? r.status}</Badge></td>
              </tr>
            )}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Reembolsos</CardTitle></CardHeader>
        <CardContent>
          <PaginatedTable
            data={statement.refunds}
            emptyState={<p className="text-sm text-muted-foreground py-4 text-center">Sem reembolsos.</p>}
            renderHeader={() => (
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">N.º Reembolso</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th className="px-3 py-2">Método</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Solicitado em</th>
              </tr>
            )}
            renderRow={(r) => (
              <tr key={r.refundId}>
                <td className="px-3 py-2 font-mono text-xs">{r.refundNumber}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.amount)}</td>
                <td className="px-3 py-2 text-xs">{r.refundMethod}</td>
                <td className="px-3 py-2"><Badge variant="outline">{REFUND_STATUS_LABELS[r.status] ?? r.status}</Badge></td>
                <td className="px-3 py-2">{new Date(r.requestedAt).toLocaleDateString("pt-PT")}</td>
              </tr>
            )}
          />
        </CardContent>
      </Card>

      <div className="max-w-sm">
        <StudentWalletCard
          wallet={wallet}
          recentTransactions={recentWalletTransactions}
          canDeposit={canDeposit}
          studentId={studentId}
        />
      </div>
    </div>
  );
}
