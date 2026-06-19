"use client";

import dynamic from "next/dynamic";
import type { RefundTrendPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

const STATUS_COLORS: Record<string, string> = {
  requested: "#f59e0b",
  approved: "#3b82f6",
  completed: "#22c55e",
  rejected: "#ef4444",
};

const STATUS_SERIES_LABELS: Record<string, string> = {
  requested: "Solicitados",
  approved: "Aprovados",
  completed: "Concluídos",
  rejected: "Rejeitados",
};

interface Props {
  rows: RefundTrendPoint[];
}

// Cohort-by-createdAt-month, sliced by current status — see
// docs/financial-reports.md "Refund Analysis Report" date semantics.
export function RefundTrendChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
        Sem reembolsos no período selecionado.
      </div>
    );
  }

  const statuses = ["requested", "approved", "completed", "rejected"] as const;
  const data = {
    categories: rows.map((r) => r.month),
    series: statuses.map((s) => ({
      name: STATUS_SERIES_LABELS[s],
      data: rows.map((r) => r[s]),
    })),
    colors: statuses.map((s) => STATUS_COLORS[s]),
  };

  return <ApexBarChart data={data} height={280} />;
}
