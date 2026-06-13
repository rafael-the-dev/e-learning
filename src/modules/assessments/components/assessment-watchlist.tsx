import Link from "next/link";
import { ASSESSMENT_COMPONENT_TYPE_LABELS } from "@/modules/assessments/types";
import type { AssessmentWatchlistItem, WatchlistSeverity } from "@/modules/assessments/services/assessment-watchlist.service";

interface Props {
  items: AssessmentWatchlistItem[];
}

const SEVERITY_BADGE: Record<WatchlistSeverity, { label: string; className: string }> = {
  critical: { label: "Crítico", className: "bg-red-100 text-red-700 border-red-200" },
  high: { label: "Alto", className: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Médio", className: "bg-amber-100 text-amber-700 border-amber-200" },
  low: { label: "Baixo", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export function AssessmentWatchlist({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y">
      {items.map((item) => {
        const badge = SEVERITY_BADGE[item.severity];
        const componentLabel = item.componentType
          ? (ASSESSMENT_COMPONENT_TYPE_LABELS[item.componentType] ?? item.componentType)
          : null;

        return (
          <div
            key={item.id}
            className="flex items-start justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-3"
          >
            <div className="flex flex-col min-w-0 gap-0.5">
              <Link
                href={`/assessments/${item.id}`}
                className="text-sm font-medium truncate hover:underline"
              >
                {item.title}
              </Link>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {item.classGroupName && <span>{item.classGroupName}</span>}
                {item.classGroupName && componentLabel && <span>·</span>}
                {componentLabel && <span>{componentLabel}</span>}
              </div>
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
              {item.totalResults > 0 && (
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
                  {item.gradedResults}/{item.totalResults}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {new Date(item.assessmentDate).toLocaleDateString("pt-PT")}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
