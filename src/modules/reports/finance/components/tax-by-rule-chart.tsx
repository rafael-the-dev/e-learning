"use client";

import dynamic from "next/dynamic";
import type { TaxByRulePoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: TaxByRulePoint[];
}

export function TaxByRuleChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem impostos no período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.taxRuleName),
    series: [{ name: "Imposto (MZN)", data: rows.map((r) => parseFloat(r.taxAmount.toFixed(2))) }],
    colors: ["#f59e0b"],
  };

  return <ApexBarChart data={data} height={220} currency horizontal />;
}
