"use client";

import { Badge } from "@/shared/components/ui/badge";
import type { PaymentMethodMixRow } from "@/modules/reports/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/modules/finance/types";

function fmt(v: number) {
  return v.toLocaleString("pt-PT", { minimumFractionDigits: 2 }) + " MZN";
}

interface Props {
  rows: PaymentMethodMixRow[];
}

export function PaymentMethodMixTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nenhum pagamento encontrado para os filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3 text-left">Método</th>
            <th className="px-4 py-3 text-right">Total Recebido</th>
            <th className="px-4 py-3 text-right">Nº Divisões</th>
            <th className="px-4 py-3 text-right">Nº Pagamentos</th>
            <th className="px-4 py-3 text-right">Valor Médio</th>
            <th className="px-4 py-3 text-right">Quota</th>
            <th className="px-4 py-3 text-right">Líquido Ajustado (Estim.)</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.method} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium">
                <Badge variant="outline" className="text-xs">
                  {PAYMENT_METHOD_LABELS[row.method] ?? row.method}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs">{fmt(row.totalAmount)}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{row.splitCount.toLocaleString("pt-PT")}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{row.paymentCount.toLocaleString("pt-PT")}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{fmt(row.averageAmount)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs">{row.sharePct.toFixed(1)}%</td>
              <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">{fmt(row.refundAdjustedNet)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20 font-semibold text-xs">
            <td className="px-4 py-3">Total</td>
            <td className="px-4 py-3 text-right font-mono">{fmt(rows.reduce((s, r) => s + r.totalAmount, 0))}</td>
            <td className="px-4 py-3 text-right">{rows.reduce((s, r) => s + r.splitCount, 0).toLocaleString("pt-PT")}</td>
            <td className="px-4 py-3 text-right">{rows.reduce((s, r) => s + r.paymentCount, 0).toLocaleString("pt-PT")}</td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3 text-right">{rows.reduce((s, r) => s + r.sharePct, 0).toFixed(1)}%</td>
            <td className="px-4 py-3 text-right font-mono text-emerald-600">
              {fmt(rows.reduce((s, r) => s + r.refundAdjustedNet, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
