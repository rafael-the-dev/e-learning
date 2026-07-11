"use client";

import { useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";

// =============================================================================
// ExaminationFilterBar — URL-driven search + filters (Phase 12, UX pass)
// -----------------------------------------------------------------------------
// The list pages already read these params server-side; this only writes them.
// It decides NOTHING about data — it debounces the text search, mirrors selects
// into the URL, resets `page` to 1 on any change, and offers a clear-all. All
// filter values live in the URL so they survive navigation and are shareable.
// =============================================================================

export interface FilterSelectConfig {
  /** URL param name (e.g. "status"). */
  param: string;
  /** PT-PT label shown as the "all" placeholder (e.g. "Estado"). */
  label: string;
  options: Array<{ value: string; label: string }>;
}

const ALL = "__all__";

export function ExaminationFilterBar({
  showSearch = true,
  searchPlaceholder = "Pesquisar…",
  selects = [],
}: {
  /** Render the text-search input. Off for lists whose read layer has no text search yet. */
  showSearch?: boolean;
  searchPlaceholder?: string;
  selects?: FilterSelectConfig[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The URL is the source of truth. The input is uncontrolled + keyed on the URL
  // value, so an external change (clear-all, back/forward) remounts it to the new
  // value — no state-in-effect, no stomping the user's in-flight typing.
  const urlSearch = searchParams.get("search") ?? "";

  const pushParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete("page"); // any filter change returns to the first page
      const qs = params.toString();
      router.push(qs ? `?${qs}` : "?");
    },
    [router, searchParams]
  );

  function onSearchChange(value: string): void {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams((p) => (value ? p.set("search", value) : p.delete("search")));
    }, 350);
  }

  function onSelectChange(param: string, value: string): void {
    pushParams((p) => (value === ALL ? p.delete(param) : p.set(param, value)));
  }

  const hasActive =
    !!urlSearch || selects.some((s) => searchParams.get(s.param));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showSearch && (
        <div className="relative min-w-55 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            key={urlSearch}
            defaultValue={urlSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Pesquisar"
          />
        </div>
      )}

      {selects.map((s) => {
        const current = searchParams.get(s.param) ?? ALL;
        return (
          <Select key={s.param} value={current} onValueChange={(v) => onSelectChange(s.param, v)}>
            <SelectTrigger className="w-45" aria-label={s.label}>
              <SelectValue placeholder={s.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{s.label}: todos</SelectItem>
              {s.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      {hasActive && (
        <Button variant="ghost" size="sm" onClick={() => router.push("?")} className="text-muted-foreground">
          <X className="mr-1 size-3.5" />
          Limpar
        </Button>
      )}
    </div>
  );
}
