import { redirect, notFound } from "next/navigation";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getReceiptById } from "@/modules/finance/services/receipt.service";
import { RECEIPT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/modules/finance/types";
import type { AuthContext } from "@/server/auth/context";

export const metadata = { title: "Recibo" };

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  let context: AuthContext;
  try {
    context = await requirePermission(PERMISSIONS.RECEIPTS_VIEW);
  } catch {
    redirect("/forbidden");
  }

  const { receiptId } = await params;
  const receipt = await getReceiptById(receiptId, context.organizationId).catch(() => null);
  if (!receipt) notFound();

  return (
    <>
      <PageHeader
        title={`Recibo ${receipt.receiptNumber}`}
        description={receipt.studentName ?? ""}
      />

      <div className="p-8">
        <div className="max-w-lg rounded-lg border p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-2xl font-bold">{receipt.receiptNumber}</p>
              <p className="text-sm text-muted-foreground">
                Emitido em {receipt.issueDate.toLocaleDateString("pt-PT")}
              </p>
            </div>
            <Badge variant={receipt.status === "CANCELLED" ? "destructive" : "default"}>
              {RECEIPT_STATUS_LABELS[receipt.status] ?? receipt.status}
            </Badge>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Aluno</span>
              <span className="font-medium">{receipt.studentName ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fatura</span>
              <span className="font-mono">{receipt.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pagamento</span>
              <span className="font-mono">{receipt.paymentNumber}</span>
            </div>
            {receipt.branchName && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Filial</span>
                <span>{receipt.branchName}</span>
              </div>
            )}
          </div>

          {receipt.splits.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Métodos de Pagamento
              </p>
              {receipt.splits.map((split) => (
                <div key={split.id} className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2">
                    <span>{PAYMENT_METHOD_LABELS[split.method] ?? split.method}</span>
                    {split.reference && (
                      <span className="text-muted-foreground font-mono text-xs">
                        {split.reference}
                      </span>
                    )}
                  </span>
                  <span className="font-medium tabular-nums">
                    {split.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4 flex justify-between items-center">
            <span className="text-muted-foreground">Valor pago</span>
            <span className="text-2xl font-bold">
              {receipt.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
