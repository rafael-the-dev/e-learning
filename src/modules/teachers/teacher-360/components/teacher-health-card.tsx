import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import { HeartPulse } from "lucide-react";
import { HEALTH_SCORE_LABELS } from "@/modules/teachers/teacher-360/types";
import type { TeacherHealthScore } from "@/modules/teachers/teacher-360/types";

const LABEL_STYLES: Record<string, { ring: string; text: string; bar: string }> = {
  EXCELLENT: { ring: "border-emerald-500", text: "text-emerald-600", bar: "bg-emerald-500" },
  HEALTHY: { ring: "border-green-500", text: "text-green-600", bar: "bg-green-500" },
  NEEDS_ATTENTION: { ring: "border-amber-500", text: "text-amber-600", bar: "bg-amber-500" },
  CRITICAL: { ring: "border-red-500", text: "text-red-600", bar: "bg-red-500" },
};

export function TeacherHealthCard({ health }: { health: TeacherHealthScore }) {
  const styles = LABEL_STYLES[health.label] ?? LABEL_STYLES.NEEDS_ATTENTION;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <HeartPulse className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Saúde do Professor</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-6">
        <div className="flex items-center gap-4 shrink-0">
          <div
            className={cn(
              "size-20 rounded-full border-4 flex items-center justify-center text-2xl font-bold",
              styles.ring,
              styles.text
            )}
          >
            {health.score}
          </div>
          <div>
            <p className={cn("text-sm font-semibold", styles.text)}>
              {HEALTH_SCORE_LABELS[health.label]}
            </p>
            <p className="text-xs text-muted-foreground max-w-[220px]">{health.recommendedAction}</p>
          </div>
        </div>

        <div className="flex-1 space-y-2 min-w-0">
          {(
            [
              ["execution", "Execução", 30],
              ["delivery", "Entrega Académica", 30],
              ["workload", "Carga de Trabalho", 20],
              ["quality", "Qualidade Académica", 20],
            ] as const
          ).map(([key, label, weight]) => (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {label} <span className="text-muted-foreground/70">({weight}%)</span>
                </span>
                <span className="font-medium tabular-nums">{Math.round(health.breakdown[key])}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full", styles.bar)}
                  style={{ width: `${Math.round(health.breakdown[key])}%` }}
                />
              </div>
            </div>
          ))}

          {health.topReasons.length > 0 && (
            <ul className="pt-2 space-y-1">
              {health.topReasons.map((reason, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="mt-1 size-1 rounded-full bg-muted-foreground shrink-0" />
                  {reason.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
