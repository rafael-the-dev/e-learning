"use client";

import Link from "next/link";
import { AlertTriangle, Clock, Layers, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Props {
  overdueCount: number;
  dueSoonCount: number;
  partiallyPaidCount: number;
  noPaymentCount: number;
}

export function InvoiceActionFilterBar({
  overdueCount,
  dueSoonCount,
  partiallyPaidCount,
  noPaymentCount,
}: Props) {
  const chips = [
    {
      count: overdueCount,
      label: "Vencidas",
      href: "/invoices?status=OVERDUE",
      icon: <AlertTriangle className="size-3 shrink-0" />,
      cls:
        overdueCount > 0
          ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
    {
      count: dueSoonCount,
      label: "A Vencer",
      href: "/invoices?agingBucket=due-soon",
      icon: <Clock className="size-3 shrink-0" />,
      cls:
        dueSoonCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
    {
      count: partiallyPaidCount,
      label: "Parc. Pagas",
      href: "/invoices?status=PARTIALLY_PAID",
      icon: <Layers className="size-3 shrink-0" />,
      cls:
        partiallyPaidCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
    {
      count: noPaymentCount,
      label: "Sem Pgto",
      href: "/invoices?paymentStatus=NO_PAYMENT",
      icon: <XCircle className="size-3 shrink-0" />,
      cls:
        noPaymentCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
  ];

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b">
      <div className="px-4 sm:px-8 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-xs text-muted-foreground font-medium shrink-0">Acesso rápido:</span>
        {chips.map((chip) => (
          <Link
            key={chip.href}
            href={chip.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors shrink-0",
              chip.cls
            )}
          >
            {chip.icon}
            {chip.label}
            <span className="font-bold tabular-nums">{chip.count.toLocaleString("pt-PT")}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
