"use client";

import Link from "next/link";
import { Clock, FileText, XCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Props {
  pendingCount: number;
  requireReceiptCount: number;
  cancelledCount: number;
}

export function PaymentActionBar({ pendingCount, requireReceiptCount, cancelledCount }: Props) {
  const chips = [
    {
      count: pendingCount,
      label: "Pendentes",
      href: "/payments?status=PENDING",
      icon: <Clock className="size-3 shrink-0" />,
      cls:
        pendingCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
    {
      count: requireReceiptCount,
      label: "Sem Recibo",
      href: "/payments?receiptStatus=MISSING",
      icon: <FileText className="size-3 shrink-0" />,
      cls:
        requireReceiptCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
    {
      count: cancelledCount,
      label: "Cancelados",
      href: "/payments?status=CANCELLED",
      icon: <XCircle className="size-3 shrink-0" />,
      cls:
        cancelledCount > 0
          ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
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
