import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { INTEGRITY_SEVERITY_LABELS, REFUND_STATUS_LABELS } from "@/modules/finance/types";
import { REFUND_WATCHLIST_ACTION_LABELS } from "../types";
import type { RefundWatchlistItem } from "../types";

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
  items: RefundWatchlistItem[];
}

// "View Refund" was dropped — no refund detail page exists in this app.
// Recommended Action and "Ver Pagamento" both deep-link to the existing
// Refunds Report / payment record, the closest real destinations, since
// there is no approve/reject/complete UI wired up yet. "Ver Aluno" links to
// the real student detail page.
export function RefundWatchlistTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum reembolso de risco elevado encontrado.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Severidade</th>
            <th className="py-2 pr-3 font-medium">Reembolso</th>
            <th className="py-2 pr-3 font-medium">Aluno</th>
            <th className="py-2 pr-3 font-medium">Filial</th>
            <th className="py-2 pr-3 font-medium">Curso</th>
            <th className="py-2 pr-3 font-medium text-right">Valor</th>
            <th className="py-2 pr-3 font-medium">Estado</th>
            <th className="py-2 pr-3 font-medium text-right">Idade</th>
            <th className="py-2 pr-3 font-medium">Problema</th>
            <th className="py-2 font-medium">Acção Recomendada</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.refundId} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Badge variant={SEVERITY_VARIANT[item.severity] ?? "outline"} className="text-[10px]">
                  {INTEGRITY_SEVERITY_LABELS[item.severity] ?? item.severity}
                </Badge>
              </td>
              <td className="py-2 pr-3 font-medium">{item.refundNumber}</td>
              <td className="py-2 pr-3">
                {item.studentId ? (
                  <Link href={`/students/${item.studentId}`} className="hover:underline">
                    {item.studentName}
                  </Link>
                ) : (
                  item.studentName
                )}
              </td>
              <td className="py-2 pr-3">{item.branchName}</td>
              <td className="py-2 pr-3">{item.courseName}</td>
              <td className="py-2 pr-3 text-right">{fmt(item.amount)}</td>
              <td className="py-2 pr-3">{REFUND_STATUS_LABELS[item.status] ?? item.status}</td>
              <td className="py-2 pr-3 text-right">{item.ageDays}d</td>
              <td className="py-2 pr-3 max-w-[220px]">{item.issue}</td>
              <td className="py-2">
                <Button asChild variant="outline" size="sm" className="h-6 text-[10px] whitespace-nowrap">
                  <Link href={item.link}>{REFUND_WATCHLIST_ACTION_LABELS[item.recommendedAction]}</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
