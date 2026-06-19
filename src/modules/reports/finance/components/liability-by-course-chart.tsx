"use client";

import dynamic from "next/dynamic";
import type { WalletLiabilityCoursePoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: WalletLiabilityCoursePoint[];
}

export function LiabilityByCourseChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-muted-foreground">
        Sem passivo de carteiras.
      </div>
    );
  }

  const data = {
    categories: rows.map((r) => r.courseName),
    series: [{ name: "Passivo (MZN)", data: rows.map((r) => parseFloat(r.totalLiability.toFixed(2))) }],
    colors: ["#0ea5e9"],
  };

  return <ApexBarChart data={data} height={220} currency horizontal />;
}
