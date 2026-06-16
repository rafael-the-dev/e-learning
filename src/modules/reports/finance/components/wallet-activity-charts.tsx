"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { WALLET_TRANSACTION_TYPE_LABELS } from "@/modules/finance/types";
import type { WalletTransactionTypePoint, WalletMonthlyPoint } from "@/modules/reports/finance/types";

const ApexDonutChart = dynamic(
  () => import("@/shared/components/charts/apex-donut-chart").then((m) => m.ApexDonutChart),
  { ssr: false }
);
const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  typeBreakdown: WalletTransactionTypePoint[];
  monthlyTrend: WalletMonthlyPoint[];
}

export function WalletActivityCharts({ typeBreakdown, monthlyTrend }: Props) {
  const donutData = {
    labels: typeBreakdown.map((t) => WALLET_TRANSACTION_TYPE_LABELS[t.type] ?? t.type),
    series: typeBreakdown.map((t) => t.count),
  };

  const months = monthlyTrend.map((p) => p.month);
  const lineData = {
    categories: months,
    series: [
      { name: "Créditos (MZN)", data: monthlyTrend.map((p) => parseFloat(p.credits.toFixed(2))) },
      { name: "Débitos (MZN)", data: monthlyTrend.map((p) => parseFloat(p.debits.toFixed(2))) },
    ],
    colors: ["#22c55e", "#ef4444"],
  };

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Transacções por Tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexDonutChart data={donutData} height={260} />
        </CardContent>
      </Card>

      {months.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Movimentos Mensais de Carteira</CardTitle>
          </CardHeader>
          <CardContent>
            <ApexLineChart data={lineData} height={260} currency />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
