"use client";

import dynamic from "next/dynamic";
import type { DiscountByRulePoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: DiscountByRulePoint[];
}

export function DiscountByRuleChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem descontos no período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.discountRuleName),
    series: [{ name: "Desconto (MZN)", data: rows.map((r) => parseFloat(r.discountAmount.toFixed(2))) }],
    colors: ["#ef4444"],
  };

  return <ApexBarChart data={data} height={220} currency horizontal />;
}
