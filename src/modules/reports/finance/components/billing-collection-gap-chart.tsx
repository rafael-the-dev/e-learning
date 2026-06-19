"use client";

import dynamic from "next/dynamic";
import type { RevenueTrendMonthlyRow } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: RevenueTrendMonthlyRow[];
}

export function BillingCollectionGapChart({ rows }: Props) {
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
      { name: "Diferença", data: rows.map((r) => parseFloat((r.invoiced - r.collected).toFixed(2))) },
    ],
    colors: ["#6366f1", "#22c55e", "#f97316"],
  };

  return <ApexBarChart data={data} height={260} currency />;
}
