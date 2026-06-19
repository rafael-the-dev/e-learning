"use client";

import dynamic from "next/dynamic";
import type { WalletLiabilityMonthlyPoint } from "@/modules/reports/finance/types";

const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: WalletLiabilityMonthlyPoint[];
}

export function WalletLiabilityTrendChart({ rows }: Props) {
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
      { name: "Créditos Emitidos", data: rows.map((r) => parseFloat(r.creditsIssued.toFixed(2))) },
      { name: "Créditos Consumidos", data: rows.map((r) => parseFloat(r.creditsConsumed.toFixed(2))) },
      { name: "Movimento Líquido", data: rows.map((r) => parseFloat(r.netMovement.toFixed(2))) },
      { name: "Passivo Acumulado", data: rows.map((r) => parseFloat(r.cumulativeLiability.toFixed(2))) },
    ],
    colors: ["#22c55e", "#ef4444", "#6366f1", "#0ea5e9"],
  };

  return <ApexLineChart data={data} height={280} currency />;
}
