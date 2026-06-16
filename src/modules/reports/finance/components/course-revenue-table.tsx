"use client";

import { Badge } from "@/shared/components/ui/badge";
import type { CourseRevenueRow } from "@/modules/reports/finance/types";

function fmt(v: number) {
  return v.toLocaleString("pt-PT", { minimumFractionDigits: 2 }) + " MZN";
}

function CollectionBadge({ rate }: { rate: number }) {
  const variant =
    rate >= 90 ? "default" : rate >= 60 ? "secondary" : "destructive";
  return (
    <Badge variant={variant} className="font-mono text-xs">
      {rate.toFixed(1)}%
    </Badge>
  );
}

interface Props {
  rows: CourseRevenueRow[];
}

export function CourseRevenueTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
        Nenhum dado encontrado para os filtros seleccionados.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3 text-left">Curso</th>
            <th className="px-4 py-3 text-right">Matrículas</th>
            <th className="px-4 py-3 text-right">Total Faturado</th>
            <th className="px-4 py-3 text-right">Total Cobrado</th>
            <th className="px-4 py-3 text-right">Saldo em Aberto</th>
            <th className="px-4 py-3 text-right">Saldo Vencido</th>
            <th className="px-4 py-3 text-right">Taxa de Cobrança</th>
            <th className="px-4 py-3 text-right">Valor Médio</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.courseId ?? "__null__"} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium">
                {row.courseId ? row.courseName : (
                  <span className="text-muted-foreground">{row.courseName}</span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {row.activeEnrollments.toLocaleString("pt-PT")}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs">{fmt(row.totalInvoiced)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">{fmt(row.totalCollected)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs text-orange-600">{fmt(row.outstandingBalance)}</td>
              <td className="px-4 py-3 text-right font-mono text-xs text-red-600">{fmt(row.overdueBalance)}</td>
              <td className="px-4 py-3 text-right">
                <CollectionBadge rate={row.collectionRate} />
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                {fmt(row.averageInvoiceValue)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/20 font-semibold text-xs">
            <td className="px-4 py-3">Total</td>
            <td className="px-4 py-3 text-right">
              {rows.reduce((s, r) => s + r.activeEnrollments, 0).toLocaleString("pt-PT")}
            </td>
            <td className="px-4 py-3 text-right font-mono">
              {fmt(rows.reduce((s, r) => s + r.totalInvoiced, 0))}
            </td>
            <td className="px-4 py-3 text-right font-mono text-emerald-600">
              {fmt(rows.reduce((s, r) => s + r.totalCollected, 0))}
            </td>
            <td className="px-4 py-3 text-right font-mono text-orange-600">
              {fmt(rows.reduce((s, r) => s + r.outstandingBalance, 0))}
            </td>
            <td className="px-4 py-3 text-right font-mono text-red-600">
              {fmt(rows.reduce((s, r) => s + r.overdueBalance, 0))}
            </td>
            <td className="px-4 py-3" />
            <td className="px-4 py-3" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
