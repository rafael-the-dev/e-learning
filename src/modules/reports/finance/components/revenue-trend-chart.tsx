"use client";

import dynamic from "next/dynamic";
import type { RevenueTrendMonthlyRow } from "@/modules/reports/finance/types";

const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: RevenueTrendMonthlyRow[];
}

export function RevenueTrendChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
        Sem dados para o período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.month),
    series: [
      { name: "Faturado", data: rows.map((r) => parseFloat(r.invoiced.toFixed(2))) },
      { name: "Cobrado", data: rows.map((r) => parseFloat(r.collected.toFixed(2))) },
      { name: "Cobrado Líquido", data: rows.map((r) => parseFloat(r.netCollected.toFixed(2))) },
      { name: "Reembolsado", data: rows.map((r) => parseFloat(r.refunded.toFixed(2))) },
    ],
    colors: ["#6366f1", "#22c55e", "#0ea5e9", "#ef4444"],
  };

  return <ApexLineChart data={data} height={280} currency />;
}
