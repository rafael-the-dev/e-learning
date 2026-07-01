"use client";

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { PROGRESSION_REQUEST_DECISION_LABELS } from "@/modules/prerequisites/types";

interface Option {
  id: string;
  name: string;
}

interface Props {
  courses: Option[];
  levels: Option[];
  defaultDecision?: string;
  defaultCourseId?: string;
  defaultLevelId?: string;
  defaultFrom?: string;
  defaultTo?: string;
}

export function ProgressionRequestFilters({
  courses,
  levels,
  defaultDecision,
  defaultCourseId,
  defaultLevelId,
  defaultFrom,
  defaultTo,
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
    <div className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Estado</Label>
        <Select defaultValue={defaultDecision ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(PROGRESSION_REQUEST_DECISION_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Curso</Label>
        <Select defaultValue={defaultCourseId ?? "ALL"} onValueChange={(v) => updateParam("courseId", v)}>
          <SelectTrigger className="w-48 h-8 text-sm">
            <SelectValue placeholder="Curso" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os cursos</SelectItem>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Nível de origem</Label>
        <Select defaultValue={defaultLevelId ?? "ALL"} onValueChange={(v) => updateParam("levelId", v)}>
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="Nível" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os níveis</SelectItem>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">De</Label>
        <Input
          type="date"
          defaultValue={defaultFrom}
          className="h-8 text-sm w-36"
          onChange={(e) => updateParam("from", e.target.value || undefined)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Até</Label>
        <Input
          type="date"
          defaultValue={defaultTo}
          className="h-8 text-sm w-36"
          onChange={(e) => updateParam("to", e.target.value || undefined)}
        />
      </div>
    </div>
  );
}
