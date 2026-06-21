"use client";

import dynamic from "next/dynamic";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/components/ui/tabs";
import type { ExecutiveTrendData } from "@/modules/dashboard/types";

const ApexLineChart = dynamic(
  () => import("@/shared/components/charts/apex-line-chart").then((m) => m.ApexLineChart),
  { ssr: false }
);
const ApexBarChart = dynamic(
  () => import("@/shared/components/charts/apex-bar-chart").then((m) => m.ApexBarChart),
  { ssr: false }
);

interface Props {
  data: ExecutiveTrendData;
}

export function ExecutiveTrendCard({ data }: Props) {
  return (
    <Card>
      <Tabs defaultValue="revenue">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Evolução Organizacional</CardTitle>
          <TabsList className="w-full mt-2 grid grid-cols-4 h-9">
            <TabsTrigger value="revenue" className="text-xs">Receitas</TabsTrigger>
            <TabsTrigger value="enrollments" className="text-xs">Matrículas</TabsTrigger>
            <TabsTrigger value="attendance" className="text-xs">Presenças</TabsTrigger>
            <TabsTrigger value="assessments" className="text-xs">Avaliações</TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent>
          <TabsContent value="revenue" className="mt-0">
            <ApexLineChart
              data={{
                categories: data.revenue.map((r) => r.month),
                series: [
                  { name: "Faturado", data: data.revenue.map((r) => parseFloat(r.invoiced.toFixed(2))) },
                  { name: "Cobrado", data: data.revenue.map((r) => parseFloat(r.collected.toFixed(2))) },
                ],
                colors: ["#6366f1", "#22c55e"],
              }}
              height={280}
              currency
            />
          </TabsContent>
          <TabsContent value="enrollments" className="mt-0">
            <ApexBarChart
              data={{
                categories: data.enrollments.map((e) => e.month),
                series: [{ name: "Matrículas", data: data.enrollments.map((e) => e.count) }],
                colors: ["#0ea5e9"],
              }}
              height={280}
            />
          </TabsContent>
          <TabsContent value="attendance" className="mt-0">
            <ApexLineChart
              data={{
                categories: data.attendance.map((a) => a.month),
                series: [{ name: "Assiduidade (%)", data: data.attendance.map((a) => parseFloat(a.attendancePct.toFixed(1))) }],
                colors: ["#f59e0b"],
              }}
              height={280}
            />
          </TabsContent>
          <TabsContent value="assessments" className="mt-0">
            <ApexBarChart
              data={{
                categories: data.assessments.map((a) => a.month),
                series: [{ name: "Avaliações Classificadas", data: data.assessments.map((a) => a.graded) }],
                colors: ["#8b5cf6"],
              }}
              height={280}
            />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
