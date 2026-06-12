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
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  RECEIPT_STATUS_FILTER_LABELS,
} from "@/modules/finance/types";

interface FilterOption {
  id: string;
  name: string;
}

interface Props {
  branches: FilterOption[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultMethod?: string;
  defaultReceiptStatus?: string;
  defaultBranchId?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
}

export function PaymentTableFilters({
  branches,
  defaultSearch,
  defaultStatus,
  defaultMethod,
  defaultReceiptStatus,
  defaultBranchId,
  defaultDateFrom,
  defaultDateTo,
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
          placeholder="Pesquisar pagamento ou aluno..."
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
          {Object.entries(PAYMENT_STATUS_LABELS).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        defaultValue={defaultMethod ?? "ALL"}
        onValueChange={(v) => updateParam("method", v)}
      >
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue placeholder="Método" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os métodos</SelectItem>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
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
              <Label className="text-xs">Estado do Recibo</Label>
              <Select
                defaultValue={defaultReceiptStatus ?? "ALL"}
                onValueChange={(v) => updateParam("receiptStatus", v)}
              >
                <SelectTrigger><SelectValue placeholder="Todos os recibos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os recibos</SelectItem>
                  {Object.entries(RECEIPT_STATUS_FILTER_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
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
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Data de Pagamento (de)</Label>
              <Input
                type="date"
                defaultValue={defaultDateFrom}
                onChange={(e) => updateParam("dateFrom", e.target.value || undefined)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data de Pagamento (até)</Label>
              <Input
                type="date"
                defaultValue={defaultDateTo}
                onChange={(e) => updateParam("dateTo", e.target.value || undefined)}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
