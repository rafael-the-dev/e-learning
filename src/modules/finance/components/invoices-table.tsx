"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCallback } from "react";
import {
  MoreHorizontal,
  Eye,
  XCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  User,
  GraduationCap,
  Bell,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
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
import { cn } from "@/shared/lib/utils";
import { INVOICE_STATUS_LABELS } from "@/modules/finance/types";
import type { Invoice } from "@/modules/finance/types";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  PENDING: { variant: "secondary" },
  PARTIALLY_PAID: { variant: "outline", className: "border-amber-300 bg-amber-50 text-amber-700" },
  PAID: { variant: "default", className: "bg-green-100 text-green-800 border-green-200" },
  OVERDUE: { variant: "destructive" },
  CANCELLED: { variant: "outline", className: "text-muted-foreground" },
};

interface Props {
  result: PaginatedResult<Invoice>;
  canCancel: boolean;
  canCreate: boolean;
}

export function InvoicesTable({ result, canCancel, canCreate }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  return (
    <div className="space-y-4">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-32">Nº Fatura</TableHead>
              <TableHead className="min-w-40">Aluno</TableHead>
              <TableHead className="hidden md:table-cell min-w-32">Matrícula</TableHead>
              <TableHead className="text-right min-w-24">Total</TableHead>
              <TableHead className="text-right hidden sm:table-cell min-w-20">Pago</TableHead>
              <TableHead className="text-right min-w-20">Saldo</TableHead>
              <TableHead className="hidden sm:table-cell min-w-28">Vencimento</TableHead>
              <TableHead className="hidden md:table-cell min-w-22.5">Dias Atraso</TableHead>
              <TableHead className="min-w-30">Estado</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                  Nenhuma fatura encontrada.
                </TableCell>
              </TableRow>
            ) : (
              result.data.map((invoice) => {
                const statusCfg = STATUS_BADGE[invoice.status] ?? { variant: "secondary" as const };
                return (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Link
                        href={`/invoices/${invoice.id}`}
                        className="font-mono text-sm hover:underline text-muted-foreground"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {invoice.issueDate.toLocaleDateString("pt-PT")}
                      </p>
                    </TableCell>
                    <TableCell>
                      {invoice.studentId ? (
                        <Link
                          href={`/students/${invoice.studentId}`}
                          className="font-medium text-sm hover:underline"
                        >
                          {invoice.studentName ?? "—"}
                        </Link>
                      ) : (
                        <span className="text-sm">{invoice.studentName ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {invoice.enrollmentId ? (
                        <Link
                          href={`/enrollments/${invoice.enrollmentId}`}
                          className="font-mono text-xs hover:underline text-muted-foreground"
                        >
                          {invoice.enrollmentNumber ?? "—"}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {invoice.totalAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums hidden sm:table-cell">
                      {invoice.paidAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span
                        className={cn(
                          "font-medium",
                          invoice.balanceAmount > 0 && invoice.status !== "CANCELLED"
                            ? "text-destructive"
                            : ""
                        )}
                      >
                        {invoice.balanceAmount.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {invoice.dueDate ? invoice.dueDate.toLocaleDateString("pt-PT") : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {invoice.status === "OVERDUE" && invoice.dueDate ? (
                        <span className={cn(
                          "text-sm font-medium tabular-nums",
                          Math.floor((Date.now() - invoice.dueDate.getTime()) / 86_400_000) > 30
                            ? "text-destructive"
                            : Math.floor((Date.now() - invoice.dueDate.getTime()) / 86_400_000) > 15
                            ? "text-orange-600"
                            : "text-amber-600"
                        )}>
                          {Math.floor((Date.now() - invoice.dueDate.getTime()) / 86_400_000)}d
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={statusCfg.variant}
                        className={cn("text-xs", statusCfg.className)}
                      >
                        {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/invoices/${invoice.id}`}>
                              <Eye className="size-4 mr-2" />
                              Ver detalhes
                            </Link>
                          </DropdownMenuItem>
                          {canCreate && invoice.status !== "CANCELLED" && invoice.status !== "PAID" && (
                            <DropdownMenuItem asChild>
                              <Link href={`/payments/new?invoiceId=${invoice.id}`}>
                                <CreditCard className="size-4 mr-2" />
                                Registar pagamento
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {invoice.studentId && (
                            <DropdownMenuItem asChild>
                              <Link href={`/students/${invoice.studentId}`}>
                                <User className="size-4 mr-2" />
                                Ver aluno
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {invoice.enrollmentId && (
                            <DropdownMenuItem asChild>
                              <Link href={`/enrollments/${invoice.enrollmentId}`}>
                                <GraduationCap className="size-4 mr-2" />
                                Ver matrícula
                              </Link>
                            </DropdownMenuItem>
                          )}
                          {invoice.status !== "CANCELLED" && invoice.status !== "PAID" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Bell className="size-4 mr-2" />
                                Enviar lembrete
                              </DropdownMenuItem>
                            </>
                          )}
                          {canCancel &&
                            invoice.status !== "CANCELLED" &&
                            invoice.paidAmount === 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link
                                    href={`/invoices/${invoice.id}?action=cancel`}
                                    className="text-destructive"
                                  >
                                    <XCircle className="size-4 mr-2" />
                                    Cancelar
                                  </Link>
                                </DropdownMenuItem>
                              </>
                            )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {result.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            {result.total} faturas · página {result.page} de {result.totalPages}
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
    </div>
  );
}
