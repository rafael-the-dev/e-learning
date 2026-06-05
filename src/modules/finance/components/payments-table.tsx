"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { MoreHorizontal, CheckCircle, XCircle, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useTransition } from "react";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Input } from "@/shared/components/ui/input";
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
import { PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/modules/finance/types";
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

interface Props {
  result: PaginatedResult<Payment>;
  defaultSearch?: string;
  defaultStatus?: string;
  canConfirm: boolean;
  canCancel: boolean;
  canIssueReceipt: boolean;
}

export function PaymentsTable({ result, defaultSearch, defaultStatus, canConfirm, canCancel, canIssueReceipt }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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

  function handleConfirm(paymentId: string) {
    startTransition(async () => {
      const result = await confirmPaymentAction({ paymentId });
      if (result.success) {
        toast.success("Pagamento confirmado");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleCancel(paymentId: string) {
    startTransition(async () => {
      const result = await cancelPaymentAction({ paymentId });
      if (result.success) {
        toast.success("Pagamento cancelado");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleIssueReceipt(paymentId: string) {
    startTransition(async () => {
      const result = await issueReceiptAction({ paymentId });
      if (result.success) {
        toast.success("Recibo emitido com sucesso");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar pagamento ou aluno..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-44">
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº Pagamento</TableHead>
              <TableHead>Aluno</TableHead>
              <TableHead>Fatura</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  Nenhum pagamento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-mono text-sm">{payment.paymentNumber}</TableCell>
                  <TableCell>{payment.studentName ?? "—"}</TableCell>
                  <TableCell className="font-mono text-sm">{payment.invoiceNumber ?? "—"}</TableCell>
                  <TableCell>{payment.paymentDate.toLocaleDateString("pt-PT")}</TableCell>
                  <TableCell className="text-sm">
                    {payment.splits.length > 0
                      ? payment.splits
                          .map(
                            (s) =>
                              `${PAYMENT_METHOD_LABELS[s.method] ?? s.method} ${s.amount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`
                          )
                          .join(" + ")
                      : (PAYMENT_METHOD_LABELS[payment.method] ?? payment.method)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {payment.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[payment.status] ?? "secondary"}>
                      {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" disabled={isPending}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canConfirm && payment.status === "PENDING" && (
                          <DropdownMenuItem onClick={() => handleConfirm(payment.id)}>
                            <CheckCircle className="size-4 mr-2" />
                            Confirmar
                          </DropdownMenuItem>
                        )}
                        {canIssueReceipt && payment.status === "CONFIRMED" && (
                          <DropdownMenuItem onClick={() => handleIssueReceipt(payment.id)}>
                            <FileText className="size-4 mr-2" />
                            Emitir Recibo
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
    </div>
  );
}
