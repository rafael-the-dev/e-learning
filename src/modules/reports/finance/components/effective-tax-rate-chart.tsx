"use client";

import dynamic from "next/dynamic";
import type { TaxMonthlyPoint } from "@/modules/reports/finance/types";

const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: TaxMonthlyPoint[];
}

export function EffectiveTaxRateChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
        Sem dados para o período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.month),
    series: [{ name: "Taxa Efectiva de Imposto (%)", data: rows.map((r) => parseFloat(r.effectiveTaxRate.toFixed(1))) }],
    colors: ["#f59e0b"],
  };

  return <ApexLineChart data={data} height={220} />;
}
