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
  SlidersHorizontal,
  CreditCard,
  User,
  GraduationCap,
  Bell,
} from "lucide-react";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
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

interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  result: PaginatedResult<Invoice>;
  defaultSearch?: string;
  defaultStatus?: string;
  defaultBranchId?: string;
  defaultCourseId?: string;
  defaultAcademicYearId?: string;
  defaultPaymentStatus?: string;
  defaultAgingBucket?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
  defaultDueDateFrom?: string;
  defaultDueDateTo?: string;
  branches: FilterOption[];
  courses: FilterOption[];
  academicYears: FilterOption[];
  canCancel: boolean;
  canCreate: boolean;
}

export function InvoicesTable({
  result,
  defaultSearch,
  defaultStatus,
  defaultBranchId,
  defaultCourseId,
  defaultAcademicYearId,
  defaultPaymentStatus,
  defaultAgingBucket,
  defaultDateFrom,
  defaultDateTo,
  defaultDueDateFrom,
  defaultDueDateTo,
  branches,
  courses,
  academicYears,
  canCancel,
  canCreate,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const AGING_BUCKET_OPTIONS = [
    { value: "1-7", label: "1–7 dias em atraso" },
    { value: "8-15", label: "8–15 dias em atraso" },
    { value: "16-30", label: "16–30 dias em atraso" },
    { value: "31+", label: "31+ dias em atraso" },
    { value: "due-soon", label: "A vencer (3 dias)" },
  ];

  const PAYMENT_STATUS_OPTIONS = [
    { value: "NO_PAYMENT", label: "Sem pagamento" },
  ];

  const FilterControls = () => (
    <div className="space-y-4">
      {/* Status */}
      <div className="space-y-1.5">
        <Label className="text-xs">Estado</Label>
        <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(INVOICE_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Payment status */}
      <div className="space-y-1.5">
        <Label className="text-xs">Estado de Pagamento</Label>
        <Select defaultValue={defaultPaymentStatus ?? "ALL"} onValueChange={(v) => updateParam("paymentStatus", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {PAYMENT_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Aging bucket */}
      <div className="space-y-1.5">
        <Label className="text-xs">Aging / Vencimento</Label>
        <Select defaultValue={defaultAgingBucket ?? "ALL"} onValueChange={(v) => updateParam("agingBucket", v)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {AGING_BUCKET_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Branch */}
      {branches.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Filial</Label>
          <Select defaultValue={defaultBranchId ?? "ALL"} onValueChange={(v) => updateParam("branchId", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todas as filiais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas as filiais</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Course */}
      {courses.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Curso</Label>
          <Select defaultValue={defaultCourseId ?? "ALL"} onValueChange={(v) => updateParam("courseId", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos os cursos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os cursos</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Academic Year */}
      {academicYears.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Ano Lectivo</Label>
          <Select defaultValue={defaultAcademicYearId ?? "ALL"} onValueChange={(v) => updateParam("academicYearId", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos os anos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os anos</SelectItem>
              {academicYears.map((y) => (
                <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Issue date range */}
      <div className="space-y-1.5">
        <Label className="text-xs">Data de Emissão (de)</Label>
        <Input
          type="date"
          defaultValue={defaultDateFrom}
          onChange={(e) => updateParam("dateFrom", e.target.value || undefined)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Data de Emissão (até)</Label>
        <Input
          type="date"
          defaultValue={defaultDateTo}
          onChange={(e) => updateParam("dateTo", e.target.value || undefined)}
        />
      </div>

      {/* Due date range */}
      <div className="space-y-1.5">
        <Label className="text-xs">Vencimento (de)</Label>
        <Input
          type="date"
          defaultValue={defaultDueDateFrom}
          onChange={(e) => updateParam("dueDateFrom", e.target.value || undefined)}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Vencimento (até)</Label>
        <Input
          type="date"
          defaultValue={defaultDueDateTo}
          onChange={(e) => updateParam("dueDateTo", e.target.value || undefined)}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search + desktop filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Input
          placeholder="Pesquisar fatura ou aluno..."
          defaultValue={defaultSearch}
          className="max-w-xs"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />

        {/* Desktop inline filters */}
        <div className="hidden lg:flex flex-wrap gap-2 items-center">
          <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os estados</SelectItem>
              {Object.entries(INVOICE_STATUS_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select defaultValue={defaultPaymentStatus ?? "ALL"} onValueChange={(v) => updateParam("paymentStatus", v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Pagamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="NO_PAYMENT">Sem pagamento</SelectItem>
            </SelectContent>
          </Select>

          <Select defaultValue={defaultAgingBucket ?? "ALL"} onValueChange={(v) => updateParam("agingBucket", v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Aging" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="1-7">1–7 dias em atraso</SelectItem>
              <SelectItem value="8-15">8–15 dias em atraso</SelectItem>
              <SelectItem value="16-30">16–30 dias em atraso</SelectItem>
              <SelectItem value="31+">31+ dias em atraso</SelectItem>
              <SelectItem value="due-soon">A vencer (3 dias)</SelectItem>
            </SelectContent>
          </Select>

          {branches.length > 0 && (
            <Select defaultValue={defaultBranchId ?? "ALL"} onValueChange={(v) => updateParam("branchId", v)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filial" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as filiais</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {courses.length > 0 && (
            <Select defaultValue={defaultCourseId ?? "ALL"} onValueChange={(v) => updateParam("courseId", v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos os cursos</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Mobile Sheet trigger */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="lg:hidden gap-1.5">
              <SlidersHorizontal className="size-3.5" />
              Filtros
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-lg">
            <SheetHeader className="mb-4">
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <FilterControls />
          </SheetContent>
        </Sheet>
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[130px]">Nº Fatura</TableHead>
              <TableHead className="min-w-[160px]">Aluno</TableHead>
              <TableHead className="hidden md:table-cell min-w-[130px]">Matrícula</TableHead>
              <TableHead className="text-right min-w-[100px]">Total</TableHead>
              <TableHead className="text-right hidden sm:table-cell min-w-[90px]">Pago</TableHead>
              <TableHead className="text-right min-w-[90px]">Saldo</TableHead>
              <TableHead className="hidden sm:table-cell min-w-[110px]">Vencimento</TableHead>
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
