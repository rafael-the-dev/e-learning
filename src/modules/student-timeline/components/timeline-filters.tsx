"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { X } from "lucide-react";
import {
  TIMELINE_EVENT_TYPE,
  TIMELINE_EVENT_TYPE_LABELS,
  TIMELINE_REFERENCE_TYPE,
  TIMELINE_REFERENCE_TYPE_LABELS,
} from "@/modules/student-timeline/types";

const EVENT_TYPE_OPTIONS = Object.entries(TIMELINE_EVENT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const REFERENCE_TYPE_OPTIONS = Object.entries(TIMELINE_REFERENCE_TYPE_LABELS).map(
  ([value, label]) => ({ value, label })
);

export function TimelineFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const eventType = searchParams.get("eventType") ?? "";
  const referenceType = searchParams.get("referenceType") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  const hasFilters = search || eventType || referenceType || from || to;

  function clearAll() {
    router.replace(pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Pesquisar…"
        value={search}
        onChange={(e) => update("search", e.target.value)}
        className="h-8 w-48 text-sm"
      />

      <Select value={eventType} onValueChange={(v) => update("eventType", v === "ALL" ? "" : v)}>
        <SelectTrigger className="h-8 w-48 text-sm">
          <SelectValue placeholder="Tipo de evento" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os tipos</SelectItem>
          {EVENT_TYPE_OPTIONS.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={referenceType}
        onValueChange={(v) => update("referenceType", v === "ALL" ? "" : v)}
      >
        <SelectTrigger className="h-8 w-44 text-sm">
          <SelectValue placeholder="Referência" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas as referências</SelectItem>
          {REFERENCE_TYPE_OPTIONS.map(({ value, label }) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <input
          type="date"
          value={from}
          onChange={(e) => update("from", e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          title="Data inicial"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="date"
          value={to}
          onChange={(e) => update("to", e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          title="Data final"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground" onClick={clearAll}>
          <X className="size-3.5" />
          Limpar
        </Button>
      )}
    </div>
  );
}
