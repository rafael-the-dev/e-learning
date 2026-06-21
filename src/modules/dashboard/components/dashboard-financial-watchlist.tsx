import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ShieldCheck } from "lucide-react";
import { DASHBOARD_SEVERITY_LABELS } from "@/modules/dashboard/types";
import type { FinancialWatchlistItem, DashboardSeverity } from "@/modules/dashboard/types";

const SEVERITY_VARIANT: Record<DashboardSeverity, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

function formatAmount(value: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MT`;
}

interface Props {
  items: FinancialWatchlistItem[];
}

export function DashboardFinancialWatchlist({ items }: Props) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="size-8 text-emerald-600" />}
        title="Sem riscos financeiros"
        description="Nenhum item financeiro requer atenção neste momento."
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
            <th className="py-2 pr-3 font-medium">Referência</th>
            <th className="py-2 pr-3 font-medium">Valor</th>
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
              <td className="py-2 pr-3 whitespace-nowrap font-mono">{item.reference}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{formatAmount(item.amount)}</td>
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
