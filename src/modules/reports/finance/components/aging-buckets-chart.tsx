"use client";

import dynamic from "next/dynamic";
import type { AgingBucketSummary } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  buckets: AgingBucketSummary[];
}

const BUCKET_COLORS = ["#94a3b8", "#22c55e", "#eab308", "#f97316", "#ef4444"];

export function AgingBucketsChart({ buckets }: Props) {
  return (
    <ApexBarChart
      data={{
        categories: buckets.map((b) => b.label),
        series: [{ name: "Saldo (MZN)", data: buckets.map((b) => parseFloat(b.totalAmount.toFixed(2))) }],
        colors: BUCKET_COLORS,
      }}
      height={240}
      currency
    />
  );
}
