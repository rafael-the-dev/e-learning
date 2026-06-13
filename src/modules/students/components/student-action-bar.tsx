"use client";

import Link from "next/link";
import { ClipboardList, AlertCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Props {
  pendingStudents: number;
  pendingEnrollments: number;
  withPendingPayments: number;
  showEnrollments: boolean;
  showPayments: boolean;
}

export function StudentActionBar({
  pendingStudents,
  pendingEnrollments,
  withPendingPayments,
  showEnrollments,
  showPayments,
}: Props) {
  const chips = [
    {
      count: pendingStudents,
      label: "Alunos Pendentes",
      href: "/students?status=PENDING",
      icon: <AlertTriangle className="size-3 shrink-0" />,
      cls:
        pendingStudents > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
      show: true,
    },
    {
      count: pendingEnrollments,
      label: "Matrículas Pendentes",
      href: "/enrollments?status=PENDING_PAYMENT",
      icon: <ClipboardList className="size-3 shrink-0" />,
      cls:
        pendingEnrollments > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
      show: showEnrollments,
    },
    {
      count: withPendingPayments,
      label: "Pagamentos Pendentes",
      href: "/invoices?status=PENDING",
      icon: <AlertCircle className="size-3 shrink-0" />,
      cls:
        withPendingPayments > 0
          ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
      show: showPayments,
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
