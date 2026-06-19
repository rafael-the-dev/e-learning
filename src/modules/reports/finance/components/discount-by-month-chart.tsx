"use client";

import dynamic from "next/dynamic";
import type { DiscountMonthlyPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: DiscountMonthlyPoint[];
}

export function DiscountByMonthChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
        Sem dados para o período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.month),
    series: [{ name: "Desconto", data: rows.map((r) => parseFloat(r.discountAmount.toFixed(2))) }],
    colors: ["#ef4444"],
  };

  return <ApexBarChart data={data} height={240} currency />;
}
