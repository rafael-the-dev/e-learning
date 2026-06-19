import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import type { ClosingFilters } from "../types";

interface Props {
  filters: ClosingFilters;
  branches: Array<{ id: string; name: string }>;
  academicYears: Array<{ id: string; name: string }>;
  academicTerms: Array<{ id: string; name: string }>;
  formId?: string;
}

export function ClosingFiltersForm({ filters, branches, academicYears, academicTerms, formId }: Props) {
  return (
    <form id={formId} method="GET" className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1 min-w-32">
        <label className="text-xs font-medium text-muted-foreground">Filial</label>
        <select name="branchId" defaultValue={filters.branchId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="">Todas</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-36">
        <label className="text-xs font-medium text-muted-foreground">Ano Académico</label>
        <select name="academicYearId" defaultValue={filters.academicYearId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="">Todos</option>
          {academicYears.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-36">
        <label className="text-xs font-medium text-muted-foreground">Período Académico</label>
        <select name="academicTermId" defaultValue={filters.academicTermId ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
          <option value="">Todos</option>
          {academicTerms.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Data De</label>
        <input type="date" name="dateFrom" defaultValue={filters.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">Data Até</label>
        <input type="date" name="dateTo" defaultValue={filters.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
      </div>
      <Button type="submit" size="sm">Filtrar</Button>
      <Button asChild variant="ghost" size="sm">
        <Link href="/reports/finance/closing">Limpar</Link>
      </Button>
    </form>
  );
}
