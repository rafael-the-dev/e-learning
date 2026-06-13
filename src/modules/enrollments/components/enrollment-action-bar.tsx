"use client";

import Link from "next/link";
import { Clock, AlertTriangle, FileText } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Props {
  pendingPaymentCount: number;
  overdueAccountsCount: number;
  activeWithoutInvoiceCount: number;
  showFinancial: boolean;
}

export function EnrollmentActionBar({
  pendingPaymentCount,
  overdueAccountsCount,
  activeWithoutInvoiceCount,
  showFinancial,
}: Props) {
  const chips = [
    {
      count: pendingPaymentCount,
      label: "Aguardam Pagamento",
      href: "/enrollments?status=PENDING_PAYMENT",
      icon: <Clock className="size-3 shrink-0" />,
      cls:
        pendingPaymentCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
      show: true,
    },
    {
      count: overdueAccountsCount,
      label: "Contas Vencidas",
      href: "/enrollments?financialStatus=OVERDUE",
      icon: <AlertTriangle className="size-3 shrink-0" />,
      cls:
        overdueAccountsCount > 0
          ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
      show: showFinancial,
    },
    {
      count: activeWithoutInvoiceCount,
      label: "Sem Fatura",
      href: "/enrollments?financialStatus=NO_INVOICE",
      icon: <FileText className="size-3 shrink-0" />,
      cls:
        activeWithoutInvoiceCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
      show: showFinancial,
    },
  ];

  return (
    <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b">
      <div className="px-4 sm:px-8 py-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-xs text-muted-foreground font-medium shrink-0">Acesso rápido:</span>
        {chips.filter((c) => c.show).map((chip) => (
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
