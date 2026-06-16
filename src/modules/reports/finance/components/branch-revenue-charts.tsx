"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { BranchRevenueRow, BranchRevenueMonthlyPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);
const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: BranchRevenueRow[];
  monthlyTrend: BranchRevenueMonthlyPoint[];
}

export function BranchRevenueCharts({ rows, monthlyTrend }: Props) {
  const top10 = rows.slice(0, 10);

  const collectedBar = {
    categories: top10.map((r) => r.branchName),
    series: [{ name: "Cobrado (MZN)", data: top10.map((r) => parseFloat(r.totalCollected.toFixed(2))) }],
    colors: ["#22c55e"],
  };

  const outstandingBar = {
    categories: top10.map((r) => r.branchName),
    series: [{ name: "Em Aberto (MZN)", data: top10.map((r) => parseFloat(r.outstandingBalance.toFixed(2))) }],
    colors: ["#f97316"],
  };

  // Build line chart — all months in data, series per branch
  const months = Array.from(new Set(monthlyTrend.map((p) => p.month))).sort();
  const branchNames = Array.from(new Set(monthlyTrend.map((p) => p.branchName)));
  const lineSeries = branchNames.map((name) => ({
    name,
    data: months.map((month) => {
      const pt = monthlyTrend.find((p) => p.month === month && p.branchName === name);
      return parseFloat((pt?.collected ?? 0).toFixed(2));
    }),
  }));
  const lineData = { categories: months, series: lineSeries };

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Cobrado por Filial</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexBarChart data={collectedBar} height={260} currency horizontal />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Saldo em Aberto por Filial</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexBarChart data={outstandingBar} height={260} currency horizontal />
        </CardContent>
      </Card>

      {months.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cobrado Mensalmente por Filial (Top 5)</CardTitle>
          </CardHeader>
          <CardContent>
            <ApexLineChart data={lineData} height={260} currency />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
