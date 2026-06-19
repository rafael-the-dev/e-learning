"use client";

import dynamic from "next/dynamic";
import type { RefundProcessingTimeTrendPoint } from "@/modules/reports/finance/types";

const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: RefundProcessingTimeTrendPoint[];
}

// Average DATEDIFF(day, createdAt, completedAt) per completedAt month —
// COMPLETED refunds only.
export function RefundProcessingTimeChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem reembolsos concluídos no período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.month),
    series: [{ name: "Dias Médios de Processamento", data: rows.map((r) => parseFloat(r.averageDays.toFixed(1))) }],
    colors: ["#8b5cf6"],
  };

  return <ApexLineChart data={data} height={220} />;
}
