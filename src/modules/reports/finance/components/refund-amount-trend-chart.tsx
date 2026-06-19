"use client";

import dynamic from "next/dynamic";
import type { RefundAmountTrendPoint } from "@/modules/reports/finance/types";

const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: RefundAmountTrendPoint[];
}

// Two series, two date bases — "Valor Reembolsado" buckets COMPLETED refunds
// by completedAt month; "Exposição Pendente" decomposes today's pending
// total by the createdAt month each pending refund originated in (not a
// historical balance reconstruction — see docs/financial-reports.md).
export function RefundAmountTrendChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
        Sem reembolsos no período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.month),
    series: [
      { name: "Valor Reembolsado", data: rows.map((r) => parseFloat(r.refundedAmount.toFixed(2))) },
      { name: "Exposição Pendente", data: rows.map((r) => parseFloat(r.pendingExposure.toFixed(2))) },
    ],
    colors: ["#22c55e", "#f59e0b"],
  };

  return <ApexLineChart data={data} height={280} currency />;
}
