"use client";

import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { CourseRevenueRow, CourseRevenueMonthlyPoint } from "@/modules/reports/finance/types";

const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);
const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);

interface Props {
  rows: CourseRevenueRow[];
  monthlyTrend: CourseRevenueMonthlyPoint[];
}

export function CourseRevenueCharts({ rows, monthlyTrend }: Props) {
  const top10 = rows.slice(0, 10);

  const revenueBar = {
    categories: top10.map((r) => r.courseName),
    series: [{ name: "Cobrado (MZN)", data: top10.map((r) => parseFloat(r.totalCollected.toFixed(2))) }],
    colors: ["#6366f1"],
  };

  const outstandingBar = {
    categories: top10.map((r) => r.courseName),
    series: [{ name: "Em Aberto (MZN)", data: top10.map((r) => parseFloat(r.outstandingBalance.toFixed(2))) }],
    colors: ["#f97316"],
  };

  // Monthly trend line chart
  const months = Array.from(new Set(monthlyTrend.map((p) => p.month))).sort();
  const courseNames = Array.from(new Set(monthlyTrend.map((p) => p.courseName)));
  const lineSeries = courseNames.map((name) => ({
    name,
    data: months.map((month) => {
      const pt = monthlyTrend.find((p) => p.month === month && p.courseName === name);
      return parseFloat((pt?.invoiced ?? 0).toFixed(2));
    }),
  }));
  const lineData = { categories: months, series: lineSeries };

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Receita por Curso</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexBarChart data={revenueBar} height={260} currency horizontal />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Saldo em Aberto por Curso</CardTitle>
        </CardHeader>
        <CardContent>
          <ApexBarChart data={outstandingBar} height={260} currency horizontal />
        </CardContent>
      </Card>

      {months.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Faturado por Mês por Curso (Top 5)</CardTitle>
          </CardHeader>
          <CardContent>
            <ApexLineChart data={lineData} height={260} currency />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
