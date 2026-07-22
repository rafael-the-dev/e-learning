import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { HeartPulse } from "lucide-react";
import { HEALTH_SCORE_LABELS } from "@/modules/students/student-360/types";
import type { StudentHealthScore } from "@/modules/students/student-360/types";
import type { StudentRiskSummary, StudentRiskLevel } from "@/modules/students/services/student-risk.service";

// The compact "estado atual" band (H7). Carries ONLY the composite indicators — health
// score, risk level, academic status — so no domain metric (média/assiduidade/dívida) is
// repeated here (those live once, in the operational cards). Health and Risk have distinct
// roles: the score is the 0–100 composite; the risk level is the concrete classification.

const HEALTH_STYLES: Record<string, { ring: string; text: string; bar: string }> = {
  EXCELLENT: { ring: "border-emerald-500", text: "text-emerald-600", bar: "bg-emerald-500" },
  HEALTHY: { ring: "border-green-500", text: "text-green-600", bar: "bg-green-500" },
  NEEDS_ATTENTION: { ring: "border-amber-500", text: "text-amber-600", bar: "bg-amber-500" },
  CRITICAL: { ring: "border-red-500", text: "text-red-600", bar: "bg-red-500" },
};

const RISK_LEVEL_LABELS: Record<StudentRiskLevel, string> = {
  UNKNOWN: "Sem dados",
  NONE: "Sem risco",
  LOW: "Baixo",
  MODERATE: "Moderado",
  HIGH: "Alto",
  CRITICAL: "Crítico",
};

const RISK_LEVEL_VARIANT: Record<StudentRiskLevel, "secondary" | "outline" | "destructive"> = {
  UNKNOWN: "outline",
  NONE: "secondary",
  LOW: "outline",
  MODERATE: "outline",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

const BREAKDOWN: ReadonlyArray<readonly [keyof StudentHealthScore["breakdown"], string]> = [
  ["academic", "Académico"],
  ["finance", "Financeiro"],
  ["attendance", "Assiduidade"],
  ["enrollment", "Matrícula"],
  ["activity", "Atividade"],
];

export function StudentStatusBand({
  health,
  risk,
  academicStatusLabel,
}: {
  health: StudentHealthScore;
  risk: StudentRiskSummary;
  // null when academic is not authorized (F-M6) → the academic status chip is omitted, not
  // rendered empty, so the band never leaks a hidden dimension.
  academicStatusLabel: string | null;
}) {
  const styles = HEALTH_STYLES[health.label] ?? HEALTH_STYLES.NEEDS_ATTENTION;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
        {/* Composite indicators — health score, risk level, academic status */}
        <div className="flex items-center gap-4 shrink-0">
          <div
            className={cn(
              "size-14 rounded-full border-4 flex items-center justify-center text-xl font-bold",
              styles.ring,
              styles.text
            )}
          >
            {health.score}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <HeartPulse className="size-3.5 text-muted-foreground" />
              <span className={cn("text-sm font-semibold", styles.text)}>
                {HEALTH_SCORE_LABELS[health.label]}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Risco:{" "}
                <Badge variant={RISK_LEVEL_VARIANT[risk.level]} className="text-xs align-middle">
                  {RISK_LEVEL_LABELS[risk.level]}
                </Badge>
              </span>
              {academicStatusLabel && (
                <>
                  <span className="text-muted-foreground/60">·</span>
                  <span>{academicStatusLabel}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Health breakdown — the "why" of the score (composite detail, not a domain metric) */}
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1.5 min-w-0">
          {BREAKDOWN.filter(([key]) => health.breakdown[key] != null).map(([key, label]) => {
            const value = Math.round(health.breakdown[key] as number);
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground truncate">{label}</span>
                  <span className="font-medium tabular-nums">{value}</span>
                </div>
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full", styles.bar)} style={{ width: `${value}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
