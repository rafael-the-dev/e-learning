"use client";

import dynamic from "next/dynamic";
import type { WalletLiabilityBranchPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: WalletLiabilityBranchPoint[];
}

export function LiabilityByBranchChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem passivo de carteiras.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.branchName),
    series: [{ name: "Passivo (MZN)", data: rows.map((r) => parseFloat(r.totalLiability.toFixed(2))) }],
    colors: ["#6366f1"],
  };

  return <ApexBarChart data={data} height={220} currency horizontal />;
}
