import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ShieldCheck } from "lucide-react";
import { DASHBOARD_SEVERITY_LABELS } from "@/modules/dashboard/types";
import type { AcademicWatchlistItem, DashboardSeverity } from "@/modules/dashboard/types";

const SEVERITY_VARIANT: Record<DashboardSeverity, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

interface Props {
  items: AcademicWatchlistItem[];
}

export function DashboardAcademicWatchlist({ items }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-8 text-emerald-600" />}
        title="Sem riscos académicos"
        description="Nenhum aluno ou avaliação requer atenção neste momento."
        className="border-0"
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Severidade</th>
            <th className="py-2 pr-3 font-medium">Aluno</th>
            <th className="py-2 pr-3 font-medium">Curso</th>
            <th className="py-2 pr-3 font-medium">Problema</th>
            <th className="py-2 font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.link}-${i}`} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Badge variant={SEVERITY_VARIANT[item.severity]} className="text-[10px]">
                  {DASHBOARD_SEVERITY_LABELS[item.severity]}
                </Badge>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">{item.studentName ?? "—"}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{item.courseName ?? "—"}</td>
              <td className="py-2 pr-3 max-w-80">{item.issue}</td>
              <td className="py-2">
                <Button asChild variant="outline" size="sm" className="h-6 text-[10px]">
                  <Link href={item.link}>Ver</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
