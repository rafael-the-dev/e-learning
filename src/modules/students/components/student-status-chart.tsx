"use client";

import { DashboardSideCard } from "@/shared/components/layout/executive-dashboard";
import { ApexDonutChart } from "@/shared/components/charts";
import { GraduationCap } from "lucide-react";

interface ChartData {
  labels: string[];
  series: number[];
  colors: string[];
}

interface Props {
  data: ChartData;
}

export function StudentStatusChart({ data }: Props) {
  return (
    <DashboardSideCard title="Alunos por Estado" icon={<GraduationCap className="size-4" />}>
      {data.series.length > 0 ? (
        <ApexDonutChart data={data} height={200} />
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">Sem alunos.</p>
      )}
    </DashboardSideCard>
  );
}
