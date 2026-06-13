import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import { CLASS_GROUP_STATUS_LABELS } from "@/modules/class-groups/types";
import type { ClassGroupWatchlistItem, WatchlistSeverity } from "@/modules/class-groups/services/class-group-watchlist.service";

interface Props {
  items: ClassGroupWatchlistItem[];
}

const SEVERITY_BADGE: Record<WatchlistSeverity, { label: string; className: string }> = {
  critical: { label: "Crítico", className: "bg-red-100 text-red-700 border-red-200" },
  high: { label: "Alto", className: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Médio", className: "bg-amber-100 text-amber-700 border-amber-200" },
  low: { label: "Baixo", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export function ClassGroupWatchlist({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y">
      {items.map((item) => {
        const badge = SEVERITY_BADGE[item.severity];
        return (
          <div
            key={item.id}
            className="flex items-start justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-2"
          >
            <div className="flex flex-col min-w-0 gap-0.5">
              <Link
                href={`/class-groups/${item.id}`}
                className="text-sm font-medium truncate hover:underline"
              >
                {item.name}
              </Link>
              <span className="text-xs text-muted-foreground truncate">{item.courseName}</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {item.issues.map((issue) => (
                  <span
                    key={issue}
                    className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5"
                  >
                    {issue}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.className}`}
              >
                {badge.label}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                {item.enrolled}/{item.capacity}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
