"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { IMPORT_JOB_TYPE_LABELS, IMPORT_JOB_STATUS_LABELS } from "@/modules/import-jobs/types";

interface ImportJobFiltersProps {
  users: { id: string; name: string }[];
  defaultSearch?: string;
  defaultType?: string;
  defaultStatus?: string;
  defaultUploadedById?: string;
  defaultDateFrom?: string;
  defaultDateTo?: string;
}

export function ImportJobFilters({
  users,
  defaultSearch,
  defaultType,
  defaultStatus,
  defaultUploadedById,
  defaultDateFrom,
  defaultDateTo,
}: ImportJobFiltersProps) {
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
          placeholder="Pesquisar por nome do ficheiro..."
          defaultValue={defaultSearch}
          className="pl-9 h-8 text-sm"
          onChange={(e) => {
            const v = e.target.value;
            const t = setTimeout(() => updateParam("search", v || undefined), 400);
            return () => clearTimeout(t);
          }}
        />
      </div>

      <Select defaultValue={defaultType ?? "ALL"} onValueChange={(v) => updateParam("type", v)}>
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os tipos</SelectItem>
          {Object.entries(IMPORT_JOB_TYPE_LABELS).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select defaultValue={defaultStatus ?? "ALL"} onValueChange={(v) => updateParam("status", v)}>
        <SelectTrigger className="w-36 h-8 text-sm">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os estados</SelectItem>
          {Object.entries(IMPORT_JOB_STATUS_LABELS).map(([val, label]) => (
            <SelectItem key={val} value={val}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {users.length > 0 && (
        <Select
          defaultValue={defaultUploadedById ?? "ALL"}
          onValueChange={(v) => updateParam("uploadedById", v)}
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Importado por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os utilizadores</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input
        type="date"
        defaultValue={defaultDateFrom}
        className="w-36 h-8 text-sm"
        onChange={(e) => updateParam("dateFrom", e.target.value || undefined)}
      />
      <Input
        type="date"
        defaultValue={defaultDateTo}
        className="w-36 h-8 text-sm"
        onChange={(e) => updateParam("dateTo", e.target.value || undefined)}
      />
    </div>
  );
}
