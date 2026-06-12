"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
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
import { Button } from "@/shared/components/ui/button";
import { INVOICE_STATUS_LABELS } from "@/modules/finance/types";

interface FilterOption {
  value: string;
  label: string;
}

interface Props {
  branches: FilterOption[];
  courses: FilterOption[];
  academicYears: FilterOption[];
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
}

const AGING_OPTIONS = [
  { value: "1-7", label: "1–7 dias em atraso" },
  { value: "8-15", label: "8–15 dias em atraso" },
  { value: "16-30", label: "16–30 dias em atraso" },
  { value: "31+", label: "31+ dias em atraso" },
  { value: "due-soon", label: "A vencer (3 dias)" },
];

export function InvoiceTableFilters({
  branches,
  courses,
  academicYears,
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

  return (
    <div className="flex items-center gap-2 flex-wrap pt-2">
      <div className="relative flex-1 min-w-44 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Pesquisar fatura ou aluno..."
          defaultValue={defaultSearch}
          className="pl-9 h-8 text-sm"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />
      </div>

      <Select
        defaultValue={defaultStatus ?? "ALL"}
        onValueChange={(v) => updateParam("status", v)}
      >
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os estados</SelectItem>
          {Object.entries(INVOICE_STATUS_LABELS).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={defaultAgingBucket ?? "ALL"}
        onValueChange={(v) => updateParam("agingBucket", v)}
      >
        <SelectTrigger className="w-40 h-8 text-sm">
          <SelectValue placeholder="Aging" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos</SelectItem>
          {AGING_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
            <SlidersHorizontal className="size-3.5" />
            Mais filtros
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Filtros avançados</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Estado de Pagamento</Label>
              <Select
                defaultValue={defaultPaymentStatus ?? "ALL"}
                onValueChange={(v) => updateParam("paymentStatus", v)}
              >
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos</SelectItem>
                  <SelectItem value="NO_PAYMENT">Sem pagamento</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {branches.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Filial</Label>
                <Select
                  defaultValue={defaultBranchId ?? "ALL"}
                  onValueChange={(v) => updateParam("branchId", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Todas as filiais" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as filiais</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {courses.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Curso</Label>
                <Select
                  defaultValue={defaultCourseId ?? "ALL"}
                  onValueChange={(v) => updateParam("courseId", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Todos os cursos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os cursos</SelectItem>
                    {courses.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {academicYears.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Ano Lectivo</Label>
                <Select
                  defaultValue={defaultAcademicYearId ?? "ALL"}
                  onValueChange={(v) => updateParam("academicYearId", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Todos os anos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os anos</SelectItem>
                    {academicYears.map((y) => (
                      <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Emissão (de)</Label>
              <Input
                type="date"
                defaultValue={defaultDateFrom}
                onChange={(e) => updateParam("dateFrom", e.target.value || undefined)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Emissão (até)</Label>
              <Input
                type="date"
                defaultValue={defaultDateTo}
                onChange={(e) => updateParam("dateTo", e.target.value || undefined)}
              />
            </div>
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
        </SheetContent>
      </Sheet>
    </div>
  );
}
