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
import { ENROLLMENT_STATUS_LABELS, FINANCIAL_STATUS_LABELS } from "@/modules/enrollments/types";

interface FilterOption {
  id: string;
  name: string;
}

interface Props {
  courses: FilterOption[];
  branches: FilterOption[];
  classGroups: FilterOption[];
  academicYears: FilterOption[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultCourseId?: string;
  defaultBranchId?: string;
  defaultClassGroupId?: string;
  defaultAcademicYearId?: string;
  defaultFinancialStatus?: string;
}

export function EnrollmentTableFilters({
  courses,
  branches,
  classGroups,
  academicYears,
  defaultSearch,
  defaultStatus,
  defaultCourseId,
  defaultBranchId,
  defaultClassGroupId,
  defaultAcademicYearId,
  defaultFinancialStatus,
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
          placeholder="Pesquisar aluno ou nº matrícula..."
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
          {Object.entries(ENROLLMENT_STATUS_LABELS).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {courses.length > 0 && (
        <Select
          defaultValue={defaultCourseId ?? "ALL"}
          onValueChange={(v) => updateParam("courseId", v)}
        >
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Curso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os cursos</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

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

            {classGroups.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Turma</Label>
                <Select
                  defaultValue={defaultClassGroupId ?? "ALL"}
                  onValueChange={(v) => updateParam("classGroupId", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as turmas</SelectItem>
                    {classGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {academicYears.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Ano Letivo</Label>
                <Select
                  defaultValue={defaultAcademicYearId ?? "ALL"}
                  onValueChange={(v) => updateParam("yearId", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Todos os anos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos os anos</SelectItem>
                    {academicYears.map((y) => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Estado Financeiro</Label>
              <Select
                defaultValue={defaultFinancialStatus ?? "ALL"}
                onValueChange={(v) => updateParam("financialStatus", v)}
              >
                <SelectTrigger><SelectValue placeholder="Todos os estados" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos os estados</SelectItem>
                  {Object.entries(FINANCIAL_STATUS_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
