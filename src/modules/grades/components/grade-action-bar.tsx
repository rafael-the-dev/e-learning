"use client";

import Link from "next/link";
import { FileEdit, AlertTriangle, ClipboardCheck } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Props {
  draftCount: number;
  submittedCount: number;
  failedSubjectCount: number;
}

export function GradeActionBar({ draftCount, submittedCount, failedSubjectCount }: Props) {
  const chips = [
    {
      count: draftCount,
      label: "Notas por Classificar",
      href: "/grades?status=DRAFT",
      icon: <FileEdit className="size-3 shrink-0" />,
      cls:
        draftCount > 0
          ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
    {
      count: submittedCount,
      label: "Aguardam Revisão",
      href: "/grades?status=SUBMITTED",
      icon: <ClipboardCheck className="size-3 shrink-0" />,
      cls:
        submittedCount > 0
          ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted",
    },
    {
      count: failedSubjectCount,
      label: "Disciplinas Reprovadas",
      href: "/grades",
      icon: <AlertTriangle className="size-3 shrink-0" />,
      cls:
        failedSubjectCount > 0
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
            key={chip.href + chip.label}
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
