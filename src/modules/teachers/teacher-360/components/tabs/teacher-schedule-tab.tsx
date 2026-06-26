import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Clock } from "lucide-react";
import { DAY_OF_WEEK_LABELS, DAY_OF_WEEK_ORDER } from "@/modules/schedules/types";
import type { TeacherScheduleRow } from "@/modules/teachers/teacher-360/types";

export function TeacherScheduleTab({ schedule }: { schedule: TeacherScheduleRow[] }) {
  if (schedule.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="size-8" />}
        title="Sem horários atribuídos"
        description="Este professor não tem aulas atribuídas em turmas ativas."
      />
    );
  }

  const grouped = new Map<string, TeacherScheduleRow[]>();
  for (const row of [...schedule].sort(
    (a, b) =>
      (DAY_OF_WEEK_ORDER[a.dayOfWeek] ?? 0) - (DAY_OF_WEEK_ORDER[b.dayOfWeek] ?? 0) ||
      a.startTime.localeCompare(b.startTime)
  )) {
    if (!grouped.has(row.dayOfWeek)) grouped.set(row.dayOfWeek, []);
    grouped.get(row.dayOfWeek)!.push(row);
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        As disciplinas indicadas são uma aproximação — resolvidas a partir das disciplinas atribuídas ao
        professor dentro do curso/nível de cada turma, não do horário em si.
      </p>
      {[...grouped.entries()].map(([dayOfWeek, rows]) => (
        <Card key={dayOfWeek}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">{DAY_OF_WEEK_LABELS[dayOfWeek] ?? dayOfWeek}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Clock className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{row.classGroupName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {row.courseName}
                      {row.courseLevelName ? ` · ${row.courseLevelName}` : ""}
                      {row.subjectNames.length > 0 ? ` · ${row.subjectNames.join(", ")}` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium tabular-nums shrink-0">
                  {row.startTime} — {row.endTime}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
