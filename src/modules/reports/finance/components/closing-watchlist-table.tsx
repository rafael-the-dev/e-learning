import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { INTEGRITY_SEVERITY_LABELS } from "@/modules/finance/types";
import { CLOSING_RECOMMENDED_ACTION_LABELS, CLOSING_WATCHLIST_CATEGORY_LABELS } from "../types";
import type { ClosingWatchlistItem } from "../types";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

interface Props {
  items: ClosingWatchlistItem[];
}

export function ClosingWatchlistTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum item urgente encontrado — finanças em ordem.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Severidade</th>
            <th className="py-2 pr-3 font-medium">Categoria</th>
            <th className="py-2 pr-3 font-medium">Entidade</th>
            <th className="py-2 pr-3 font-medium">Valor</th>
            <th className="py-2 pr-3 font-medium">Descrição</th>
            <th className="py-2 pr-3 font-medium">Acção Recomendada</th>
            <th className="py-2 font-medium">Link</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.category}-${item.entityReference}-${i}`} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Badge variant={SEVERITY_VARIANT[item.severity] ?? "outline"} className="text-[10px]">
                  {INTEGRITY_SEVERITY_LABELS[item.severity] ?? item.severity}
                </Badge>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">{CLOSING_WATCHLIST_CATEGORY_LABELS[item.category]}</td>
              <td className="py-2 pr-3">
                <span className="font-medium">{item.entityType}</span>{" "}
                <span className="font-mono text-muted-foreground">{item.entityReference}</span>
              </td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {item.amount != null ? `${item.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN` : "—"}
              </td>
              <td className="py-2 pr-3 max-w-80">{item.description}</td>
              <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                {CLOSING_RECOMMENDED_ACTION_LABELS[item.recommendedAction]}
              </td>
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
