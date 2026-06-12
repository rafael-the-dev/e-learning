"use client";

import Link from "next/link";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Button } from "@/shared/components/ui/button";
import { ShieldAlert, ShieldX, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { RiskStudent } from "@/modules/students/types";

const SEVERITY_CONFIG = {
  high: {
    icon: ShieldX,
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    dotClass: "bg-red-500",
    label: "Crítico",
  },
  medium: {
    icon: AlertTriangle,
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    dotClass: "bg-amber-500",
    label: "Médio",
  },
  low: {
    icon: ShieldAlert,
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
    dotClass: "bg-blue-500",
    label: "Baixo",
  },
} as const;

interface RiskWatchlistProps {
  students: RiskStudent[];
}

export function RiskWatchlist({ students }: RiskWatchlistProps) {
  if (students.length === 0) return null;

  return (
    <div className="divide-y">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-4 px-5 py-2 text-xs font-medium text-muted-foreground hidden sm:grid">
        <span>Aluno</span>
        <span>Curso</span>
        <span>Problema</span>
        <span>Gravidade</span>
        <span>Ação</span>
      </div>

      {students.map((student) => {
        const config = SEVERITY_CONFIG[student.severity];
        const Icon = config.icon;

        return (
          <div
            key={student.id}
            className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 sm:gap-4 px-5 py-3 items-center hover:bg-muted/30 transition-colors"
          >
            {/* Student */}
            <div className="min-w-0">
              <Link
                href={`/students/${student.id}`}
                className="font-medium text-sm hover:underline truncate block"
              >
                {student.fullName}
              </Link>
              {student.email && (
                <p className="text-xs text-muted-foreground truncate">{student.email}</p>
              )}
              {student.phone && (
                <p className="text-xs text-muted-foreground">{student.phone}</p>
              )}
            </div>

            {/* Course */}
            <div className="min-w-0">
              {student.courseName ? (
                <>
                  <p className="text-sm truncate">{student.courseName}</p>
                  {student.courseLevelName && (
                    <p className="text-xs text-muted-foreground truncate">{student.courseLevelName}</p>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground italic">Sem curso</span>
              )}
            </div>

            {/* Issue */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Icon className="size-3.5 shrink-0" />
              <span className="text-sm">{student.issue}</span>
            </div>

            {/* Severity badge */}
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
                <Link href={`/students/${student.id}`}>
                  <ExternalLink className="size-3 mr-1" />
                  Ver perfil
                </Link>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
