"use client";

import dynamic from "next/dynamic";
import type { WalletLiabilityMonthlyPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: WalletLiabilityMonthlyPoint[];
}

export function CreditsIssuedConsumedChart({ rows }: Props) {
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
    ],
    colors: ["#22c55e", "#ef4444"],
  };

  return <ApexBarChart data={data} height={240} currency />;
}
