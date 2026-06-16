"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, FileText, CreditCard, Receipt, Wallet, RefreshCcw, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { StatCard } from "@/shared/components/layout/stat-card";
import { Badge } from "@/shared/components/ui/badge";
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECEIPT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
  REFUND_METHOD_LABELS,
  FINANCIAL_TRANSACTION_TYPE_LABELS,
} from "@/modules/finance/types";
import type { StudentFinancialStatement } from "@/modules/reports/finance/types";

function fmt(amount: number) {
  return amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 }) + " MZN";
}

function fmtDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-PT");
}

interface Props {
  statement: StudentFinancialStatement;
}

export function StudentStatementView({ statement }: Props) {
  const { student, kpis, invoices, payments, receipts, walletTransactions, refunds, ledger } = statement;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <StatCard title="Total Faturado" value={fmt(kpis.totalInvoiced)} icon={<FileText className="size-4" />} description="Faturas emitidas (excl. canceladas)" />
        <StatCard title="Total Pago" value={fmt(kpis.totalPaid)} icon={<CreditCard className="size-4" />} description="Pagamentos confirmados" />
        <StatCard title="Crédito Aplicado" value={fmt(kpis.creditApplied)} icon={<Layers className="size-4" />} description="Saldo de carteira utilizado" />
        <StatCard title="Total Reembolsado" value={fmt(kpis.totalRefunded)} icon={<RefreshCcw className="size-4" />} description="Reembolsos concluídos" />
        <StatCard title="Saldo Carteira" value={fmt(kpis.walletBalance)} icon={<Wallet className="size-4" />} description="Saldo atual da carteira" />
        <StatCard title="Saldo Devedor" value={fmt(kpis.outstandingBalance)} icon={<Receipt className="size-4" />} description="Valor por liquidar" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Invoices */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="size-4" /> Faturas ({invoices.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {invoices.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Sem faturas.</p>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {invoices.map((inv) => (
                  <div key={inv.invoiceId} className="flex items-center justify-between px-6 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Link href={`/invoices/${inv.invoiceId}`} className="font-mono text-xs hover:underline text-primary">
                        {inv.invoiceNumber}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">
                        {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold">{fmt(inv.totalAmount)}</div>
                      {inv.balanceAmount > 0 && (
                        <div className="text-[10px] text-red-600">Saldo: {fmt(inv.balanceAmount)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payments */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="size-4" /> Pagamentos ({payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Sem pagamentos.</p>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {payments.map((p) => (
                  <div key={p.paymentId} className="flex items-center justify-between px-6 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Link href={`/payments/${p.paymentId}`} className="font-mono text-xs hover:underline text-primary">
                        {p.paymentNumber}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">
                        {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold text-emerald-600">{fmt(p.totalAmount)}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtDate(p.paymentDate)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Receipts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="size-4" /> Recibos ({receipts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {receipts.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Sem recibos.</p>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {receipts.map((r) => (
                  <div key={r.receiptId} className="flex items-center justify-between px-6 py-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <Link href={`/receipts/${r.receiptId}`} className="font-mono text-xs hover:underline text-primary">
                        {r.receiptNumber}
                      </Link>
                      <Badge variant="outline" className="text-[10px]">
                        {RECEIPT_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold">{fmt(r.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtDate(r.issueDate)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Wallet Transactions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="size-4" /> Carteira ({walletTransactions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {walletTransactions.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">Sem movimentos de carteira.</p>
            ) : (
              <div className="divide-y max-h-72 overflow-y-auto">
                {walletTransactions.map((t) => (
                  <div key={t.transactionId} className="flex items-center justify-between px-6 py-2.5 text-sm">
                    <div>
                      <p className="text-xs font-medium">{t.type}</p>
                      <p className="text-[10px] text-muted-foreground">{t.description ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold">{fmt(t.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">{fmtDate(t.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Refunds */}
      {refunds.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCcw className="size-4" /> Reembolsos ({refunds.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {refunds.map((r) => (
                <div key={r.refundId} className="flex items-center justify-between px-6 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{r.refundNumber}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {REFUND_STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {REFUND_METHOD_LABELS[r.refundMethod] ?? r.refundMethod}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-semibold text-red-600">-{fmt(r.amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtDate(r.completedAt ?? r.requestedAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ledger Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Linha Temporal do Razão</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ledger.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">Sem entradas no razão financeiro.</p>
          ) : (
            <div className="divide-y max-h-96 overflow-y-auto">
              {ledger.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between px-6 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-full p-1 ${entry.direction === "CREDIT" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}>
                      {entry.direction === "CREDIT" ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
                    </div>
                    <div>
                      <p className="text-xs font-medium">
                        {FINANCIAL_TRANSACTION_TYPE_LABELS[entry.transactionType] ?? entry.transactionType}
                      </p>
                      {entry.description && (
                        <p className="text-[10px] text-muted-foreground">{entry.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono text-xs font-semibold ${entry.direction === "CREDIT" ? "text-emerald-600" : "text-red-600"}`}>
                      {entry.direction === "CREDIT" ? "+" : "-"}{fmt(entry.amount)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">{fmtDate(entry.occurredAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
