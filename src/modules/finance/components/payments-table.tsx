"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback, useState } from "react";
import {
  MoreHorizontal,
  CheckCircle,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Wallet,
  ExternalLink,
  Filter,
} from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECEIPT_STATUS_FILTER_LABELS,
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

interface FilterOption {
  id: string;
  name: string;
}

interface Props {
  result: PaginatedResult<Payment>;
  branches: FilterOption[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultMethod?: string;
  defaultReceiptStatus?: string;
  defaultBranchId?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  canConfirm: boolean;
  canCancel: boolean;
  canIssueReceipt: boolean;
  walletBalances: Record<string, number>;
}

export function PaymentsTable({
  result,
  branches,
  defaultSearch,
  defaultStatus,
  defaultMethod,
  defaultReceiptStatus,
  defaultBranchId,
  defaultDateFrom,
  defaultDateTo,
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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "ALL") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams]
  );

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v && v !== "ALL") params.set(k, v);
      else params.delete(k);
    });
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

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

  const FilterControls = (
    <div className="flex flex-col gap-3">
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">Pesquisar</Label>
        <Input
          placeholder="Pagamento ou aluno..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select defaultValue={defaultMethod ?? "ALL"} onValueChange={(v) => updateParam("method", v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Método" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os métodos</SelectItem>
            {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          defaultValue={defaultReceiptStatus ?? "ALL"}
          onValueChange={(v) => updateParam("receiptStatus", v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado do Recibo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os recibos</SelectItem>
            {Object.entries(RECEIPT_STATUS_FILTER_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {branches.length > 0 && (
          <Select
            defaultValue={defaultBranchId ?? "ALL"}
            onValueChange={(v) => updateParam("branchId", v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as filiais</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            defaultValue={defaultDateFrom ?? ""}
            className="w-36 text-sm"
            onChange={(e) => updateParam("dateFrom", e.target.value || undefined)}
          />
          <span className="text-muted-foreground text-xs">até</span>
          <Input
            type="date"
            defaultValue={defaultDateTo ?? ""}
            className="w-36 text-sm"
            onChange={(e) => updateParam("dateTo", e.target.value || undefined)}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop filters */}
      <div className="hidden md:block space-y-3">{FilterControls}</div>

      {/* Mobile: collapsed filters in a sheet */}
      <div className="flex items-center gap-2 md:hidden">
        <Input
          placeholder="Pesquisar pagamento ou aluno..."
          defaultValue={defaultSearch}
          className="flex-1"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              <Filter className="size-4 mr-1.5" />
              Filtros
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-auto">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Estado</Label>
                <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => { updateParam("status", v); setMobileFiltersOpen(false); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os estados</SelectItem>
                    {Object.entries(PAYMENT_STATUS_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Método</Label>
                <Select defaultValue={defaultMethod ?? "ALL"} onValueChange={(v) => { updateParam("method", v); setMobileFiltersOpen(false); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Método" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os métodos</SelectItem>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Recibo</Label>
                <Select defaultValue={defaultReceiptStatus ?? "ALL"} onValueChange={(v) => { updateParam("receiptStatus", v); setMobileFiltersOpen(false); }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Recibo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os recibos</SelectItem>
                    {Object.entries(RECEIPT_STATUS_FILTER_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {branches.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">Filial</Label>
                  <Select defaultValue={defaultBranchId ?? "ALL"} onValueChange={(v) => { updateParam("branchId", v); setMobileFiltersOpen(false); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Filial" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todas as filiais</SelectItem>
                      {branches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Data (de/até)</Label>
                <div className="flex items-center gap-1.5">
                  <Input type="date" defaultValue={defaultDateFrom ?? ""} className="flex-1 text-sm" onChange={(e) => updateParam("dateFrom", e.target.value || undefined)} />
                  <span className="text-xs text-muted-foreground">—</span>
                  <Input type="date" defaultValue={defaultDateTo ?? ""} className="flex-1 text-sm" onChange={(e) => updateParam("dateTo", e.target.value || undefined)} />
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Table */}
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

      {/* Pagination */}
      {result.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">
            Página {result.page} de {result.totalPages}
          </span>
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
      )}

      {/* Confirmation dialog */}
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
