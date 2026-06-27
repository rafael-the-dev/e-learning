import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Wallet } from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import { INVOICE_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/modules/student-portal/types";
import type {
  StudentPaymentsSummary,
  StudentInvoiceRow,
  StudentPaymentRow,
} from "@/modules/student-portal/types";

interface Props {
  summary: StudentPaymentsSummary;
  invoices: StudentInvoiceRow[];
  payments: StudentPaymentRow[];
}

const INVOICE_BADGE: Record<string, "destructive" | "warning" | "secondary"> = {
  OVERDUE: "destructive",
  PENDING: "warning",
  PARTIALLY_PAID: "warning",
};

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export function StudentPaymentsPanel({ summary, invoices, payments }: Props) {
  return (
    <Card id="pagamentos" className="scroll-mt-20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Pagamentos</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Total em Dívida" value={formatCurrency(summary.totalDue)} />
          <MiniStat label="Valor Vencido" value={formatCurrency(summary.overdueAmount)} />
          <MiniStat
            label="Próximo Vencimento"
            value={summary.nextDueDate ? summary.nextDueDate.toLocaleDateString("pt-PT") : "—"}
          />
          <MiniStat label="Saldo da Carteira" value={formatCurrency(summary.walletBalance)} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Facturas por Liquidar</p>
          {invoices.length === 0 ? (
            <EmptyState
              icon={<Wallet className="size-8" />}
              title="Sem facturas por liquidar."
              className="border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factura</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Em Dívida</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.invoiceId}>
                      <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {inv.dueDate ? inv.dueDate.toLocaleDateString("pt-PT") : "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(inv.totalAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(inv.balanceAmount)}</TableCell>
                      <TableCell>
                        <Badge variant={INVOICE_BADGE[inv.status] ?? "secondary"}>
                          {INVOICE_STATUS_LABELS[inv.status] ?? inv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Histórico de Pagamentos</p>
          {payments.length === 0 ? (
            <EmptyState icon={<Wallet className="size-8" />} title="Sem pagamentos registados." className="border-0" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.paymentId}>
                      <TableCell className="font-medium">{p.paymentNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{p.paymentDate.toLocaleDateString("pt-PT")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(p.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
