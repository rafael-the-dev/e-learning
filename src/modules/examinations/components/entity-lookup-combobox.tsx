"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2, Check, Clock } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";

// =============================================================================
// EntityLookupCombobox — the ONE picker for the whole portal (Increment 4)
// -----------------------------------------------------------------------------
// Search + debounce + loading + empty state + keyboard + clear + selected badge +
// recent selections (localStorage). Specialised by thin wrappers (StudentLookup,
// RoomLookup, …) that only supply a `fetcher` and labels. It holds NO domain
// knowledge and makes NO permission decision — it renders what the server returns.
// =============================================================================

export interface LookupItem {
  value: string;
  label: string;
  sublabel?: string;
}

const RECENT_MAX = 6;

function readRecent(key?: string): LookupItem[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as LookupItem[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(key: string | undefined, item: LookupItem): void {
  if (!key || typeof window === "undefined") return;
  try {
    const existing = readRecent(key).filter((r) => r.value !== item.value);
    window.localStorage.setItem(key, JSON.stringify([item, ...existing].slice(0, RECENT_MAX)));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function EntityLookupCombobox({
  value,
  selectedLabel,
  onChange,
  fetcher,
  placeholder = "Pesquisar…",
  emptyText = "Nenhum resultado.",
  recentKey,
  disabled = false,
  id,
}: {
  value: string | null;
  selectedLabel?: string | null;
  onChange: (value: string | null, item: LookupItem | null) => void;
  fetcher: (query: string) => Promise<LookupItem[]>;
  placeholder?: string;
  emptyText?: string;
  recentKey?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupItem[]>([]);
  const [recent, setRecent] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqRef = useRef(0);

  // Close on outside click. (Adding a listener is allowed in an effect; the setState
  // lives in the callback, not the effect body.)
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const showRecent = query.trim() === "" && recent.length > 0;
  const flat: LookupItem[] = showRecent
    ? [...recent, ...results.filter((r) => !recent.some((x) => x.value === r.value))]
    : results;

  async function runFetch(q: string): Promise<void> {
    const req = ++reqRef.current;
    setLoading(true);
    try {
      const items = await fetcher(q);
      if (reqRef.current === req) {
        setResults(items);
        setHighlight(0);
      }
    } catch {
      if (reqRef.current === req) setResults([]);
    } finally {
      if (reqRef.current === req) setLoading(false);
    }
  }

  function openAndLoad(): void {
    setOpen(true);
    setRecent(readRecent(recentKey));
    void runFetch("");
  }

  function onQueryChange(v: string): void {
    setQuery(v);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void runFetch(v), 300);
  }

  function select(item: LookupItem): void {
    writeRecent(recentKey, item);
    onChange(item.value, item);
    setOpen(false);
    setQuery("");
  }

  function clear(): void {
    onChange(null, null);
    setQuery("");
    setResults([]);
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      openAndLoad();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[highlight];
      if (item) select(item);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // ── Selected state: compact badge with a clear button ──
  if (value && selectedLabel) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <span className="flex items-center gap-2 truncate">
          <Check className="size-4 shrink-0 text-primary" />
          <span className="truncate">{selectedLabel}</span>
        </span>
        {!disabled && (
          <button type="button" onClick={clear} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Limpar seleção">
            <X className="size-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          className="pl-8"
          autoComplete="off"
          onFocus={openAndLoad}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-list` : undefined}
        />
        {loading && <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {open && (
        <div
          id={id ? `${id}-list` : undefined}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {showRecent && (
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
              <Clock className="size-3" /> Últimos utilizados
            </div>
          )}
          {flat.length === 0 && !loading && <div className="px-2 py-3 text-center text-sm text-muted-foreground">{emptyText}</div>}
          {flat.map((item, i) => {
            const isRecentDivider = showRecent && i === recent.length && flat.length > recent.length;
            return (
              <div key={`${item.value}-${i}`}>
                {isRecentDivider && <div className="my-1 border-t" />}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => select(item)}
                  className={cn(
                    "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm",
                    i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.sublabel && <span className="text-xs text-muted-foreground">{item.sublabel}</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
