"use client";

import dynamic from "next/dynamic";
import type { PaymentMethodMixRow } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: PaymentMethodMixRow[];
}

export function PaymentMethodAvgSplitChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem pagamentos no período selecionado.
      </div>
    );
  }

  const sorted = [...rows].sort((a, b) => b.averageAmount - a.averageAmount);
  const data = {
    categories: sorted.map((r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method),
    series: [{ name: "Valor Médio (MZN)", data: sorted.map((r) => parseFloat(r.averageAmount.toFixed(2))) }],
    colors: ["#6366f1"],
  };

  return <ApexBarChart data={data} height={220} currency horizontal />;
}
