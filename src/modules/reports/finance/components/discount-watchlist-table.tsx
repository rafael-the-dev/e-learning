import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { INTEGRITY_SEVERITY_LABELS } from "@/modules/finance/types";
import { DISCOUNT_WATCHLIST_ACTION_LABELS } from "../types";
import type { DiscountWatchlistItem } from "../types";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

function fmt(value: number): string {
  return `${value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`;
}

interface Props {
  items: DiscountWatchlistItem[];
}

export function DiscountWatchlistTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum desconto de risco elevado encontrado.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Severidade</th>
            <th className="py-2 pr-3 font-medium">Fatura</th>
            <th className="py-2 pr-3 font-medium">Aluno</th>
            <th className="py-2 pr-3 font-medium">Filial</th>
            <th className="py-2 pr-3 font-medium">Curso</th>
            <th className="py-2 pr-3 font-medium text-right">Valor de Desconto</th>
            <th className="py-2 pr-3 font-medium text-right">Taxa de Fuga</th>
            <th className="py-2 pr-3 font-medium">Regra</th>
            <th className="py-2 pr-3 font-medium">Aplicado Por</th>
            <th className="py-2 font-medium">Acção Recomendada</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.invoiceId} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Badge variant={SEVERITY_VARIANT[item.severity] ?? "outline"} className="text-[10px]">
                  {INTEGRITY_SEVERITY_LABELS[item.severity] ?? item.severity}
                </Badge>
              </td>
              <td className="py-2 pr-3 font-medium">{item.invoiceNumber}</td>
              <td className="py-2 pr-3">{item.studentName}</td>
              <td className="py-2 pr-3">{item.branchName}</td>
              <td className="py-2 pr-3">{item.courseName}</td>
              <td className="py-2 pr-3 text-right">{fmt(item.discountAmount)}</td>
              <td className="py-2 pr-3 text-right">{item.leakageRate.toFixed(1)}%</td>
              <td className="py-2 pr-3">{item.discountRuleName}</td>
              <td className="py-2 pr-3">{item.appliedByName ?? "—"}</td>
              <td className="py-2">
                <Button asChild variant="outline" size="sm" className="h-6 text-[10px] whitespace-nowrap">
                  <Link href={item.link}>{DISCOUNT_WATCHLIST_ACTION_LABELS[item.recommendedAction]}</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
