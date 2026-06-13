import Link from "next/link";
import { Badge } from "@/shared/components/ui/badge";
import type { GradeWatchlistItem } from "@/modules/grades/services/grade-watchlist.service";

interface Props {
  items: GradeWatchlistItem[];
}

export function GradeWatchlist({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="divide-y">
      {items.map((item) => (
        <div key={item.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
          <div className="flex flex-col min-w-0">
            <Link
              href={`/students/${item.studentId}`}
              className="text-sm font-medium truncate hover:underline"
            >
              {item.studentName}
            </Link>
            <span className="text-xs text-muted-foreground truncate">{item.subjectName}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            {item.finalGrade != null && (
              <span className="text-xs font-mono tabular-nums text-red-600 font-semibold">
                {item.finalGrade.toLocaleString("pt-PT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>
            )}
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
              Reprovado
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
