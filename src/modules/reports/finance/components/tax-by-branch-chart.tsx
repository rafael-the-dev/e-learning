"use client";

import dynamic from "next/dynamic";
import type { TaxByBranchPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: TaxByBranchPoint[];
}

export function TaxByBranchChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem impostos no período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.branchName),
    series: [{ name: "Imposto (MZN)", data: rows.map((r) => parseFloat(r.taxAmount.toFixed(2))) }],
    colors: ["#6366f1"],
  };

  return <ApexBarChart data={data} height={220} currency horizontal />;
}
