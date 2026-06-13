import Link from "next/link";
import type {
  ProgressWatchlistItem,
  WatchlistSeverity,
} from "@/modules/grades/services/progress-dashboard-watchlist.service";

interface Props {
  items: ProgressWatchlistItem[];
}

const SEVERITY_BADGE: Record<WatchlistSeverity, { label: string; className: string }> = {
  critical: { label: "Crítico", className: "bg-red-100 text-red-700 border-red-200" },
  high: { label: "Alto", className: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { label: "Médio", className: "bg-amber-100 text-amber-700 border-amber-200" },
  low: { label: "Baixo", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  COMPLETED: "Concluído",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Em Recuperação",
  BLOCKED: "Bloqueado",
  NOT_STARTED: "Não Iniciado",
  ELIGIBLE_TO_PROGRESS: "Elegível",
};

const STATUS_COLORS: Record<string, string> = {
  IN_PROGRESS: "text-indigo-600",
  PASSED: "text-emerald-600",
  COMPLETED: "text-emerald-600",
  FAILED: "text-red-600",
  RECOVERY_REQUIRED: "text-orange-600",
  BLOCKED: "text-red-700",
  NOT_STARTED: "text-slate-400",
  ELIGIBLE_TO_PROGRESS: "text-amber-600",
};

export function ProgressWatchlist({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y">
      {items.map((item) => {
        const badge = SEVERITY_BADGE[item.severity];

        return (
          <div
            key={item.id}
            className="flex items-start justify-between px-4 py-3 hover:bg-muted/30 transition-colors gap-3"
          >
            <div className="flex flex-col min-w-0 gap-0.5">
              <Link
                href={`/enrollments/${item.enrollmentId}`}
                className="text-sm font-medium truncate hover:underline"
              >
                {item.studentName}
              </Link>
              <span className="text-xs text-muted-foreground truncate">{item.courseName}</span>
              {item.levelName && (
                <span className="text-[10px] text-muted-foreground font-mono truncate">
                  {item.levelName}
                </span>
              )}
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
              <span
                className={`text-[10px] font-medium ${STATUS_COLORS[item.status] ?? "text-muted-foreground"}`}
              >
                {STATUS_LABELS[item.status] ?? item.status}
              </span>
              {item.finalGrade !== null && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  Nota: {item.finalGrade}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
