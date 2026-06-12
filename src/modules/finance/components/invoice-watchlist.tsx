"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { ShieldX, AlertTriangle, ShieldAlert, Info, ExternalLink, CreditCard } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { InvoiceWatchlistItem } from "@/modules/finance/types";

const SEVERITY_CONFIG = {
  critical: {
    icon: ShieldX,
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
    label: "Crítico",
  },
  high: {
    icon: AlertTriangle,
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
    dotClass: "bg-orange-500",
    label: "Alto",
  },
  medium: {
    icon: ShieldAlert,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    label: "Médio",
  },
  low: {
    icon: Info,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    label: "Baixo",
  },
} as const;

interface InvoiceWatchlistProps {
  items: InvoiceWatchlistItem[];
  canCreate: boolean;
}

export function InvoiceWatchlist({ items, canCreate }: InvoiceWatchlistProps) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y">
      {/* Desktop / tablet header */}
      <div className="hidden md:grid grid-cols-[1fr_auto_1fr_auto_auto_auto_auto_auto] gap-3 px-5 py-2 text-xs font-medium text-muted-foreground">
        <span>Aluno</span>
        <span>Nº Fatura</span>
        <span>Matrícula</span>
        <span className="text-right">Total</span>
        <span className="text-right">Saldo</span>
        <span>Vencimento</span>
        <span>Problema</span>
        <span>Gravidade</span>
      </div>

      {items.map((item) => {
        const config = SEVERITY_CONFIG[item.severity];
        const Icon = config.icon;

        return (
          <div key={item.invoiceId} className="hover:bg-muted/30 transition-colors">
            {/* Mobile card layout */}
            <div className="md:hidden px-4 py-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {item.studentId ? (
                    <Link
                      href={`/students/${item.studentId}`}
                      className="font-medium text-sm hover:underline truncate block"
                    >
                      {item.studentName ?? "—"}
                    </Link>
                  ) : (
                    <span className="font-medium text-sm">{item.studentName ?? "—"}</span>
                  )}
                  <p className="text-xs text-muted-foreground font-mono">
                    {item.invoiceNumber}
                    {item.enrollmentNumber && (
                      <span className="ml-2">· {item.enrollmentNumber}</span>
                    )}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0",
                    config.badgeClass
                  )}
                >
                  <span className={cn("size-1.5 rounded-full shrink-0", config.dotClass)} />
                  {config.label}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{item.issue}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {item.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MT
                  </span>
                  {" "}em saldo
                  {item.dueDate && (
                    <span className="ml-2">
                      · vence {item.dueDate.toLocaleDateString("pt-PT")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canCreate && (
                    <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      <Link href={`/payments/new?invoiceId=${item.invoiceId}`}>
                        <CreditCard className="size-3 mr-1" />
                        Pagar
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <Link href={`/invoices/${item.invoiceId}`}>
                      <ExternalLink className="size-3 mr-1" />
                      Ver
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Desktop row */}
            <div className="hidden md:grid grid-cols-[1fr_auto_1fr_auto_auto_auto_auto_auto] gap-3 px-5 py-3 items-center">
              {/* Student */}
              <div className="min-w-0">
                {item.studentId ? (
                  <Link
                    href={`/students/${item.studentId}`}
                    className="font-medium text-sm hover:underline truncate block"
                  >
                    {item.studentName ?? "—"}
                  </Link>
                ) : (
                  <span className="font-medium text-sm truncate block">{item.studentName ?? "—"}</span>
                )}
              </div>

              {/* Invoice number */}
              <div className="shrink-0">
                <Link
                  href={`/invoices/${item.invoiceId}`}
                  className="font-mono text-sm hover:underline text-muted-foreground"
                >
                  {item.invoiceNumber}
                </Link>
              </div>

              {/* Enrollment */}
              <div className="min-w-0">
                {item.enrollmentId ? (
                  <Link
                    href={`/enrollments/${item.enrollmentId}`}
                    className="font-mono text-sm hover:underline truncate block"
                  >
                    {item.enrollmentNumber ?? "—"}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Sem matrícula</span>
                )}
              </div>

              {/* Total */}
              <div className="shrink-0 text-right">
                <span className="text-sm font-medium tabular-nums">
                  {item.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Balance */}
              <div className="shrink-0 text-right">
                <span className="text-sm font-medium tabular-nums">
                  {item.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Due date */}
              <div className="shrink-0 text-sm text-muted-foreground">
                {item.dueDate ? item.dueDate.toLocaleDateString("pt-PT") : "—"}
              </div>

              {/* Issue */}
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-sm truncate">{item.issue}</span>
              </div>

              {/* Severity + actions */}
              <div className="shrink-0 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                    config.badgeClass
                  )}
                >
                  <span className={cn("size-1.5 rounded-full shrink-0", config.dotClass)} />
                  {config.label}
                </span>
                {canCreate && (
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    <Link href={`/payments/new?invoiceId=${item.invoiceId}`}>
                      <CreditCard className="size-3 mr-1" />
                      Pagar
                    </Link>
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  <Link href={`/invoices/${item.invoiceId}`}>
                    <ExternalLink className="size-3 mr-1" />
                    Ver
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
