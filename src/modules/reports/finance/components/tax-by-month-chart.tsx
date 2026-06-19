"use client";

import dynamic from "next/dynamic";
import type { TaxMonthlyPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: TaxMonthlyPoint[];
}

export function TaxByMonthChart({ rows }: Props) {
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
      { name: "Imposto", data: rows.map((r) => parseFloat(r.taxAmount.toFixed(2))) },
      { name: "Base Tributável", data: rows.map((r) => parseFloat(r.taxableBase.toFixed(2))) },
    ],
    colors: ["#f59e0b", "#6366f1"],
  };

  return <ApexBarChart data={data} height={240} currency />;
}
