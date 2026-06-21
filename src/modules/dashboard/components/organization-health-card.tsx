import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { HEALTH_RATING_LABELS } from "@/modules/dashboard/types";
import type { OrganizationHealthScore } from "@/modules/dashboard/types";

const RATING_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  EXCELLENT: "default",
  HEALTHY: "secondary",
  ATTENTION: "outline",
  CRITICAL: "destructive",
};

const RATING_BAR_COLOR: Record<string, string> = {
  EXCELLENT: "bg-emerald-500",
  HEALTHY: "bg-blue-500",
  ATTENTION: "bg-amber-500",
  CRITICAL: "bg-red-500",
};

const CATEGORIES: Array<{ key: keyof Pick<OrganizationHealthScore, "financial" | "academic" | "attendance" | "operational">; label: string }> = [
  { key: "financial", label: "Financeiro" },
  { key: "academic", label: "Académico" },
  { key: "attendance", label: "Presença" },
  { key: "operational", label: "Operacional" },
];

function TrendIcon({ trend }: { trend: OrganizationHealthScore["trend"] }) {
  if (trend === "UP") return <TrendingUp className="size-4 text-emerald-600" />;
  if (trend === "DOWN") return <TrendingDown className="size-4 text-red-600" />;
  return <Minus className="size-4 text-muted-foreground" />;
}

interface Props {
  health: OrganizationHealthScore;
}

export function OrganizationHealthCard({ health }: Props) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold tabular-nums">
              {health.score}
              <span className="text-base text-muted-foreground">/100</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={RATING_VARIANT[health.rating] ?? "outline"}>
                  {HEALTH_RATING_LABELS[health.rating]}
                </Badge>
                <TrendIcon trend={health.trend} />
              </div>
              <p className="text-xs text-muted-foreground">Índice de Saúde Organizacional</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground lg:border-l lg:pl-6 lg:flex-1">{health.summary}</p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:w-auto lg:min-w-72">
            {CATEGORIES.map(({ key, label }) => {
              const category = health[key];
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium tabular-nums">{category.score}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", RATING_BAR_COLOR[health.rating])}
                      style={{ width: `${category.score}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
