"use client";

import dynamic from "next/dynamic";
import type { PaymentMethodMixMonthlyPoint } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_COLORS } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";

const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: PaymentMethodMixMonthlyPoint[];
}

export function PaymentMethodMonthlyTrendChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
        Sem pagamentos no período selecionado.
      </div>
    );
  }

  const months = Array.from(new Set(rows.map((r) => r.month))).sort();
  const methods = Array.from(new Set(rows.map((r) => r.method)));

  const series = methods.map((method) => ({
    name: PAYMENT_METHOD_LABELS[method] ?? method,
    data: months.map((month) => {
      const pt = rows.find((r) => r.month === month && r.method === method);
      return parseFloat((pt?.totalAmount ?? 0).toFixed(2));
    }),
  }));

  const data = {
    categories: months,
    series,
    colors: methods.map((m) => PAYMENT_METHOD_COLORS[m] ?? "#94a3b8"),
  };

  return <ApexLineChart data={data} height={280} currency />;
}
