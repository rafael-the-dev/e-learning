"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useTransition } from "react";
import {
  MoreHorizontal,
  CheckCircle,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/modules/finance/types";
import { confirmPaymentAction, cancelPaymentAction } from "@/modules/finance/actions/payment.actions";
import { issueReceiptAction } from "@/modules/finance/actions/receipt.actions";
import type { Payment } from "@/modules/finance/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  CONFIRMED: "default",
  CANCELLED: "destructive",
  REFUNDED: "outline",
};

const RECEIPT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ISSUED: { label: "Emitido", className: "bg-green-50 text-green-700 border-green-200" },
  CANCELLED: { label: "Cancelado", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

interface Props {
  result: PaginatedResult<Payment>;
  canConfirm: boolean;
  canCancel: boolean;
  canIssueReceipt: boolean;
  walletBalances: Record<string, number>;
}

export function PaymentsTable({
  result,
  canConfirm,
  canCancel,
  canIssueReceipt,
  walletBalances,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [confirmingPayment, setConfirmingPayment] = useState<Payment | null>(null);
  const [walletCreditInput, setWalletCreditInput] = useState("");

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  function openConfirmDialog(payment: Payment) {
    setConfirmingPayment(payment);
    setWalletCreditInput("");
  }

  function submitConfirm() {
    if (!confirmingPayment) return;
    const walletCredit = parseFloat(walletCreditInput) || 0;
    startTransition(async () => {
      const res = await confirmPaymentAction({
        paymentId: confirmingPayment.id,
        walletCreditAmount: walletCredit > 0 ? walletCredit : undefined,
      });
      setConfirmingPayment(null);
      if (res.success) {
        toast.success("Pagamento confirmado");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleCancel(paymentId: string) {
    startTransition(async () => {
      const res = await cancelPaymentAction({ paymentId });
      if (res.success) {
        toast.success("Pagamento cancelado");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleIssueReceipt(paymentId: string) {
    startTransition(async () => {
      const res = await issueReceiptAction({ paymentId });
      if (res.success) {
        toast.success("Recibo emitido com sucesso");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const confirmingWalletBalance =
    confirmingPayment?.studentId != null
      ? (walletBalances[confirmingPayment.studentId] ?? 0)
      : 0;

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Pagamento</TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead>Fatura</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Métodos</TableHead>
              <TableHead className="text-right">Recebido</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Recibo</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                  Nenhum pagamento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <Link href={`/payments/${payment.id}`} className="font-mono text-sm hover:underline">
                      {payment.paymentNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {payment.studentId ? (
                      <Link href={`/students/${payment.studentId}`} className="hover:underline text-sm">
                        {payment.studentName ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-sm">{payment.studentName ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {payment.invoiceId ? (
                      <Link href={`/invoices/${payment.invoiceId}`} className="hover:underline">
                        {payment.invoiceNumber ?? "—"}
                      </Link>
                    ) : (payment.invoiceNumber ?? "—")}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {payment.paymentDate.toLocaleDateString("pt-PT")}
                  </TableCell>
                  <TableCell className="text-sm">
                    {payment.splits.length > 0
                      ? payment.splits
                          .map(
                            (s) =>
                              `${PAYMENT_METHOD_LABELS[s.method] ?? s.method} ${s.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`
                          )
                          .join(" + ")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <span className="tabular-nums text-sm">
                      {payment.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[payment.status] ?? "secondary"}>
                      {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {payment.receiptStatus ? (
                      (() => {
                        const cfg = RECEIPT_STATUS_CONFIG[payment.receiptStatus];
                        return cfg ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
                            {cfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{payment.receiptStatus}</span>
                        );
                      })()
                    ) : payment.status === "CONFIRMED" ? (
                      <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
                        Pendente
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" disabled={isPending}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/payments/${payment.id}`}>
                            <ExternalLink className="size-4 mr-2" />
                            Ver detalhes
                          </Link>
                        </DropdownMenuItem>
                        {payment.invoiceId && (
                          <DropdownMenuItem asChild>
                            <Link href={`/invoices/${payment.invoiceId}`}>
                              <FileText className="size-4 mr-2" />
                              Ver fatura
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {payment.studentId && (
                          <DropdownMenuItem asChild>
                            <Link href={`/students/${payment.studentId}`}>
                              <ExternalLink className="size-4 mr-2" />
                              Ver aluno
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {canConfirm && payment.status === "PENDING" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openConfirmDialog(payment)}>
                              <CheckCircle className="size-4 mr-2" />
                              Confirmar
                            </DropdownMenuItem>
                          </>
                        )}
                        {canIssueReceipt && payment.status === "CONFIRMED" && payment.receiptStatus !== "ISSUED" && (
                          <DropdownMenuItem onClick={() => handleIssueReceipt(payment.id)}>
                            <FileText className="size-4 mr-2" />
                            Emitir recibo
                          </DropdownMenuItem>
                        )}
                        {canCancel && (payment.status === "PENDING" || payment.status === "CONFIRMED") && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleCancel(payment.id)}
                            >
                              <XCircle className="size-4 mr-2" />
                              Cancelar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {result.total.toLocaleString("pt-PT")} pagamentos · página {result.page} de {result.totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!result.hasPreviousPage}
              onClick={() => updateParam("page", String(result.page - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!result.hasNextPage}
              onClick={() => updateParam("page", String(result.page + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={confirmingPayment !== null}
        onOpenChange={(open) => { if (!open) setConfirmingPayment(null); }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
          </DialogHeader>

          {confirmingPayment && (
            <div className="space-y-4 py-1">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pagamento</span>
                  <span className="font-mono">{confirmingPayment.paymentNumber}</span>
                </div>
                {confirmingPayment.invoiceNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fatura</span>
                    <span className="font-mono">{confirmingPayment.invoiceNumber}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-medium tabular-nums">
                    {confirmingPayment.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {confirmingPayment.studentId != null && confirmingWalletBalance > 0 && (
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Wallet className="size-3.5 text-muted-foreground" />
                    Crédito da carteira
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      Disponível:{" "}
                      <span className="font-medium text-foreground">
                        {confirmingWalletBalance.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                      </span>
                    </span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={confirmingWalletBalance}
                    placeholder="0.00"
                    value={walletCreditInput}
                    onChange={(e) => setWalletCreditInput(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Opcional — deixar em branco para não aplicar crédito.
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingPayment(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitConfirm} disabled={isPending}>
              {isPending ? "A confirmar..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
