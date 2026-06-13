"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
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
import { Label } from "@/shared/components/ui/label";
import { STUDENT_RESULT_STATUS_LABELS } from "@/modules/grades/types";

interface FilterSubject {
  id: string;
  name: string;
}

interface FilterClassGroup {
  id: string;
  name: string;
}

interface Props {
  subjects: FilterSubject[];
  classGroups: FilterClassGroup[];
  defaultSearch?: string;
  defaultSubjectId?: string;
  defaultClassGroupId?: string;
  defaultStatus?: string;
}

export function GradeTableFilters({
  subjects,
  classGroups,
  defaultSearch,
  defaultSubjectId,
  defaultClassGroupId,
  defaultStatus,
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

  const activeFilters = [defaultSubjectId, defaultClassGroupId, defaultStatus].filter(Boolean).length;

  return (
    <div className="flex items-center gap-2 flex-wrap pt-2">
      <div className="relative flex-1 min-w-44 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Pesquisar por aluno ou código..."
          defaultValue={defaultSearch}
          className="pl-9 h-8 text-sm"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />
      </div>

      <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
        <SelectTrigger className="w-40 h-8 text-sm">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os estados</SelectItem>
          {Object.entries(STUDENT_RESULT_STATUS_LABELS)
            .filter(([k]) => k !== "CANCELLED")
            .map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
        </SelectContent>
      </Select>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <SlidersHorizontal className="size-3.5" />
            Filtros
            {activeFilters > 0 && (
              <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold w-4 h-4 flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            {subjects.length > 0 && (
              <div className="space-y-2">
                <Label>Disciplina</Label>
                <Select
                  defaultValue={defaultSubjectId ?? "ALL"}
                  onValueChange={(v) => updateParam("subjectId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as disciplinas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as disciplinas</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {classGroups.length > 0 && (
              <div className="space-y-2">
                <Label>Turma</Label>
                <Select
                  defaultValue={defaultClassGroupId ?? "ALL"}
                  onValueChange={(v) => updateParam("classGroupId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as turmas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as turmas</SelectItem>
                    {classGroups.map((cg) => (
                      <SelectItem key={cg.id} value={cg.id}>{cg.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
