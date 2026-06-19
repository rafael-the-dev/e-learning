"use client";

import { ApexDonutChart } from "@/shared/components/charts/apex-donut-chart";
import type { RefundByStatusPoint } from "@/modules/reports/finance/types";
import { REFUND_STATUS_LABELS } from "@/modules/finance/types";

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "#f59e0b",
  APPROVED: "#3b82f6",
  COMPLETED: "#22c55e",
  REJECTED: "#ef4444",
};

interface Props {
  rows: RefundByStatusPoint[];
}

export function RefundByStatusChart({ rows }: Props) {
  const data = {
    labels: rows.map((r) => REFUND_STATUS_LABELS[r.status] ?? r.status),
    series: rows.map((r) => r.count),
    colors: rows.map((r) => STATUS_COLORS[r.status] ?? "#94a3b8"),
  };

  return <ApexDonutChart data={data} height={240} />;
}
