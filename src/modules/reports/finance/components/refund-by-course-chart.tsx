"use client";

import dynamic from "next/dynamic";
import type { RefundByCoursePoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: RefundByCoursePoint[];
}

export function RefundByCourseChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem reembolsos concluídos no período selecionado.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.courseName),
    series: [{ name: "Reembolsado (MZN)", data: rows.map((r) => parseFloat(r.totalAmount.toFixed(2))) }],
    colors: ["#f97316"],
  };

  return <ApexBarChart data={data} height={220} currency horizontal />;
}
