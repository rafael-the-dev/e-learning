import type { QuickStats } from "@/modules/dashboard/types";

interface Props {
  stats: QuickStats;
}

export function DashboardQuickStats({ stats }: Props) {
  const items = [
    { label: "Taxa de Aprovação", value: stats.approvalRate },
    { label: "Taxa de Cobrança", value: stats.collectionRate },
    { label: "Taxa de Ocupação", value: stats.occupancyRate },
    { label: "Assiduidade Média", value: stats.averageAttendance },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border p-3 text-center">
          <p className="text-lg font-bold tabular-nums">{item.value.toFixed(0)}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
