"use client";

import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { ShieldX, AlertTriangle, ShieldAlert, Info, ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { EnrollmentWatchlistItem } from "@/modules/enrollments/types";

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

interface EnrollmentWatchlistProps {
  items: EnrollmentWatchlistItem[];
}

export function EnrollmentWatchlist({ items }: EnrollmentWatchlistProps) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y">
      <div className="hidden sm:grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_auto] gap-4 px-5 py-2 text-xs font-medium text-muted-foreground">
        <span>Aluno</span>
        <span>N.º Matrícula</span>
        <span>Curso</span>
        <span>Turma</span>
        <span>Problema</span>
        <span>Gravidade</span>
        <span>Ação</span>
      </div>

      {items.map((item) => {
        const config = SEVERITY_CONFIG[item.severity];
        const Icon = config.icon;

        return (
          <div
            key={item.enrollmentId}
            className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_auto] gap-2 sm:gap-4 px-5 py-3 items-center hover:bg-muted/30 transition-colors"
          >
            {/* Student */}
            <div className="min-w-0">
              <Link
                href={`/students/${item.studentId}`}
                className="font-medium text-sm hover:underline truncate block"
              >
                {item.studentName}
              </Link>
              {item.studentCode && (
                <p className="text-xs text-muted-foreground font-mono">{item.studentCode}</p>
              )}
            </div>

            {/* Enrollment # */}
            <div className="shrink-0">
              <Link
                href={`/enrollments/${item.enrollmentId}`}
                className="font-mono text-sm hover:underline text-muted-foreground"
              >
                {item.enrollmentNumber ?? "—"}
              </Link>
            </div>

            {/* Course */}
            <div className="min-w-0">
              <p className="text-sm truncate">{item.courseName}</p>
              {item.courseLevelName && (
                <p className="text-xs text-muted-foreground truncate">{item.courseLevelName}</p>
              )}
            </div>

            {/* Class group */}
            <div className="shrink-0">
              <span className="text-sm text-muted-foreground">
                {item.classGroupName ?? <span className="italic text-xs">Sem turma</span>}
              </span>
            </div>

            {/* Issue */}
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate">{item.issue}</span>
            </div>

            {/* Severity */}
            <div className="shrink-0">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                  config.badgeClass
                )}
              >
                <span className={cn("size-1.5 rounded-full shrink-0", config.dotClass)} />
                {config.label}
              </span>
            </div>

            {/* Action */}
            <div className="shrink-0">
              <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Link href={`/enrollments/${item.enrollmentId}`}>
                  <ExternalLink className="size-3 mr-1" />
                  Ver
                </Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
