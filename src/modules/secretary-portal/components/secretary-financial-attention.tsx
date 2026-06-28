import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Wallet, AlertTriangle, CreditCard, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import type { SecretaryFinancialAttention } from "@/modules/secretary-portal/types";

interface Props {
  attention: SecretaryFinancialAttention;
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  amount: number;
  href?: string;
}

function AttentionRow({ icon, label, count, amount, href }: RowProps) {
  const body = (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50">
      <span className="rounded-md bg-muted/60 p-2 text-muted-foreground shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{count.toLocaleString("pt-PT")} registo(s)</p>
      </div>
      <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(amount)}</span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function SecretaryFinancialAttention({ attention }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Wallet className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Atenção Financeira</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <AttentionRow
          icon={<AlertTriangle className="size-4 text-red-500" />}
          label="Facturas Vencidas"
          count={attention.overdueInvoiceCount}
          amount={attention.overdueAmount}
          href="/invoices"
        />
        <AttentionRow
          icon={<CreditCard className="size-4 text-blue-500" />}
          label="Pagamentos a Confirmar"
          count={attention.pendingPaymentCount}
          amount={attention.pendingPaymentAmount}
          href="/payments"
        />
        <AttentionRow
          icon={<RotateCcw className="size-4 text-amber-500" />}
          label="Reembolsos Pendentes"
          count={attention.pendingRefundCount}
          amount={attention.pendingRefundAmount}
          href="/payments"
        />
      </CardContent>
    </Card>
  );
}
