"use client";

import { ApexDonutChart } from "@/shared/components/charts/apex-donut-chart";
import type { PaymentMethodMixRow } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_COLORS } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";

interface Props {
  rows: PaymentMethodMixRow[];
}

export function PaymentMethodMixDonutChart({ rows }: Props) {
  const data = {
    labels: rows.map((r) => PAYMENT_METHOD_LABELS[r.method] ?? r.method),
    series: rows.map((r) => parseFloat(r.totalAmount.toFixed(2))),
    colors: rows.map((r) => PAYMENT_METHOD_COLORS[r.method] ?? "#94a3b8"),
  };

  return <ApexDonutChart data={data} height={240} />;
}
