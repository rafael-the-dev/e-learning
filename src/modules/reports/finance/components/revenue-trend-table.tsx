import type { RevenueTrendMonthlyRow } from "../types";

interface Props {
  rows: RevenueTrendMonthlyRow[];
}

function fmt(value: number): string {
  return value.toLocaleString("pt-PT", { minimumFractionDigits: 2 });
}

export function RevenueTrendTable({ rows }: Props) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Sem dados para o período selecionado.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Mês</th>
            <th className="py-2 pr-3 font-medium text-right">Faturado</th>
            <th className="py-2 pr-3 font-medium text-right">Cobrado</th>
            <th className="py-2 pr-3 font-medium text-right">Reembolsado</th>
            <th className="py-2 pr-3 font-medium text-right">Cobrado Líquido</th>
            <th className="py-2 pr-3 font-medium text-right">Em Aberto</th>
            <th className="py-2 font-medium text-right">Taxa de Cobrança</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month} className="border-b last:border-0">
              <td className="py-2 pr-3 font-medium">{r.month}</td>
              <td className="py-2 pr-3 text-right">{fmt(r.invoiced)}</td>
              <td className="py-2 pr-3 text-right">{fmt(r.collected)}</td>
              <td className="py-2 pr-3 text-right text-destructive">{fmt(r.refunded)}</td>
              <td className="py-2 pr-3 text-right font-medium">{fmt(r.netCollected)}</td>
              <td className="py-2 pr-3 text-right">{fmt(r.outstanding)}</td>
              <td className="py-2 text-right">{r.collectionRate.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
