"use client";

import { ApexDonutChart } from "@/shared/components/charts/apex-donut-chart";

interface Props {
  manualAmount: number;
  automaticAmount: number;
}

// AppliedDiscount.discountRuleId is NOT NULL and DiscountRule.discountType
// has no "MANUAL" value, so manualAmount is always 0 under the current
// schema — every discount is rule-based. See docs/financial-reports.md.
export function ManualVsAutomaticDiscountChart({ manualAmount, automaticAmount }: Props) {
  const data = {
    labels: ["Automático / Baseado em Regra", "Manual"],
    series: [parseFloat(automaticAmount.toFixed(2)), parseFloat(manualAmount.toFixed(2))],
    colors: ["#6366f1", "#94a3b8"],
  };

  return <ApexDonutChart data={data} height={220} />;
}
