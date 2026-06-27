import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Badge } from "@/shared/components/ui/badge";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { redirectIfStudentScoped } from "@/server/auth/student-scope";
import { PERMISSIONS } from "@/server/auth/permissions";
import { getReceiptById } from "@/modules/finance/services/receipt.service";
import { Wallet, ArrowRight } from "lucide-react";
import {
  RECEIPT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  INVOICE_ITEM_TYPE_LABELS,
  ALLOCATION_TYPE_LABELS,
} from "@/modules/finance/types";

export const metadata = { title: "Recibo" };

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ receiptId: string }>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.RECEIPTS_VIEW);
  // A student-scoped user is routed to their own /student Portal — never org-wide/other-student data. See student-scope.ts.
  await redirectIfStudentScoped(context);

  const { receiptId } = await params;
  const receipt = await getReceiptById(receiptId, context.organizationId).catch(() => null);
  if (!receipt) notFound();

  const paymentAllocs = receipt.allocations.filter((a) => a.allocationType === "PAYMENT");
  const walletAllocs = receipt.allocations.filter((a) => a.allocationType === "WALLET_CREDIT");

  const breadcrumb = (
    <nav className="flex items-center gap-2 text-muted-foreground">
      <Link href="/receipts" className="hover:text-foreground transition-colors">
        Recibos
      </Link>
      <span>/</span>
      <span className="text-foreground">{receipt.receiptNumber}</span>
      {receipt.studentId && receipt.studentName && (
        <>
          <span>·</span>
          <Link href={`/students/${receipt.studentId}`} className="hover:text-foreground transition-colors">
            {receipt.studentName}
          </Link>
        </>
      )}
    </nav>
  );

  return (
    <>
      <PageHeader
        title={`Recibo ${receipt.receiptNumber}`}
        description={receipt.studentName ?? ""}
        breadcrumb={breadcrumb}
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
              <Link href={`/invoices/${receipt.invoiceId}`} className="font-mono hover:underline">
                {receipt.invoiceNumber}
              </Link>
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
                Novo dinheiro recebido
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

          {receipt.walletCreditAmount > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Crédito da carteira
              </p>
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2 text-green-600">
                  <Wallet className="size-4" />
                  <span>Crédito aplicado</span>
                </span>
                <span className="font-medium tabular-nums text-green-600">
                  {receipt.walletCreditAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {receipt.allocations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Liquidação por item
              </p>
              {receipt.allocations.map((alloc) => (
                <div key={alloc.id} className="flex justify-between items-center text-sm">
                  <span className="flex flex-col">
                    <span>
                      {alloc.itemDescription ??
                        (alloc.itemType ? (INVOICE_ITEM_TYPE_LABELS[alloc.itemType] ?? alloc.itemType) : "Item")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {ALLOCATION_TYPE_LABELS[alloc.allocationType] ?? alloc.allocationType}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {alloc.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {receipt.overpaymentAmount > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Excesso creditado na carteira
              </p>
              <div className="flex justify-between items-center text-sm">
                <span className="flex items-center gap-2 text-blue-600">
                  <ArrowRight className="size-4" />
                  <span>Excesso → carteira</span>
                </span>
                <span className="font-medium tabular-nums text-blue-600">
                  +{receipt.overpaymentAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          <div className="border-t pt-4 flex justify-between items-center">
            <span className="text-muted-foreground">Total liquidado</span>
            <span className="text-2xl font-bold">
              {receipt.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
