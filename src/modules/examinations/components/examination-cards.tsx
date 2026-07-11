import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";

// KPI + summary cards for the examination portal. Presentational only.

export function ExaminationKpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function ExaminationSummaryCard({
  title,
  items,
  children,
}: {
  title: string;
  items?: Array<{ label: string; value: ReactNode }>;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items?.map((it) => (
          <div key={it.label} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">{it.label}</span>
            <span className="font-medium">{it.value}</span>
          </div>
        ))}
        {children}
      </CardContent>
    </Card>
  );
}
