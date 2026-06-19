import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { INTEGRITY_SEVERITY_LABELS } from "@/modules/finance/types";
import { WALLET_LIABILITY_ACTION_LABELS } from "../types";
import type { WalletLiabilityWatchlistItem } from "../types";

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "secondary",
  LOW: "outline",
};

interface Props {
  items: WalletLiabilityWatchlistItem[];
}

export function WalletLiabilityWatchlistTable({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum item urgente encontrado.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Severidade</th>
            <th className="py-2 pr-3 font-medium">Aluno</th>
            <th className="py-2 pr-3 font-medium">Filial</th>
            <th className="py-2 pr-3 font-medium">Curso</th>
            <th className="py-2 pr-3 font-medium text-right">Saldo Atual</th>
            <th className="py-2 pr-3 font-medium">Última Transacção</th>
            <th className="py-2 pr-3 font-medium text-right">Dias Dormente</th>
            <th className="py-2 pr-3 font-medium">Problema</th>
            <th className="py-2 font-medium">Acção Recomendada</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={`${item.studentId ?? "integrity"}-${i}`} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <Badge variant={SEVERITY_VARIANT[item.severity] ?? "outline"} className="text-[10px]">
                  {INTEGRITY_SEVERITY_LABELS[item.severity] ?? item.severity}
                </Badge>
              </td>
              <td className="py-2 pr-3 font-medium">{item.studentName}</td>
              <td className="py-2 pr-3">{item.branchName}</td>
              <td className="py-2 pr-3">{item.courseName}</td>
              <td className="py-2 pr-3 text-right">
                {item.currentBalance != null
                  ? `${item.currentBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })} MZN`
                  : "—"}
              </td>
              <td className="py-2 pr-3">
                {item.lastTransactionDate ? new Date(item.lastTransactionDate).toLocaleDateString("pt-PT") : "—"}
              </td>
              <td className="py-2 pr-3 text-right">{item.daysDormant ?? "—"}</td>
              <td className="py-2 pr-3 max-w-72">{item.issue}</td>
              <td className="py-2">
                <Button asChild variant="outline" size="sm" className="h-6 text-[10px] whitespace-nowrap">
                  <Link href={item.link}>{WALLET_LIABILITY_ACTION_LABELS[item.recommendedAction]}</Link>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
