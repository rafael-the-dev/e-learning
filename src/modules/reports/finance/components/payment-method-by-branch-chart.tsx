"use client";

import dynamic from "next/dynamic";
import type { PaymentMethodMixByBranchPoint } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_COLORS } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  rows: PaymentMethodMixByBranchPoint[];
}

// 100%-composition stacked bar — makes cash-heavy branches visually obvious
// (a branch whose bar is mostly the CASH color is cash-dependent).
export function PaymentMethodByBranchChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-muted-foreground">
        Sem pagamentos no período selecionado.
      </div>
    );
  }

  const branchTotals = new Map<string, number>();
  for (const r of rows) {
    branchTotals.set(r.branchName, (branchTotals.get(r.branchName) ?? 0) + r.totalAmount);
  }
  const branches = Array.from(branchTotals.keys()).sort(
    (a, b) => (branchTotals.get(b) ?? 0) - (branchTotals.get(a) ?? 0)
  );
  const methods = Array.from(new Set(rows.map((r) => r.method)));

  const series = methods.map((method) => ({
    name: PAYMENT_METHOD_LABELS[method] ?? method,
    data: branches.map((branchName) => {
      const pt = rows.find((r) => r.branchName === branchName && r.method === method);
      return parseFloat((pt?.totalAmount ?? 0).toFixed(2));
    }),
  }));

  const data = {
    categories: branches,
    series,
    colors: methods.map((m) => PAYMENT_METHOD_COLORS[m] ?? "#94a3b8"),
  };

  return <ApexBarChart data={data} height={280} currency stacked horizontal />;
}
