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

export function CollectionRateChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
        Sem dados para o período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.month),
    series: [{ name: "Taxa de Cobrança (%)", data: rows.map((r) => parseFloat(r.collectionRate.toFixed(1))) }],
    colors: ["#0ea5e9"],
  };

  return <ApexLineChart data={data} height={220} />;
}
