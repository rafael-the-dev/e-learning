import { History } from "lucide-react";
import { TimelineItem } from "./timeline-item";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";

export function TimelineList({
  events,
  canDelete,
}: {
  events: StudentTimelineEvent[];
  canDelete: boolean;
}) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <span className="inline-flex items-center justify-center size-12 rounded-full bg-muted">
          <History className="size-6 text-muted-foreground" />
        </span>
        <div>
          <p className="text-sm font-medium">Sem eventos registados</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Os eventos do aluno aparecerão aqui à medida que forem ocorrendo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <TimelineItem
          key={event.id}
          event={event}
          canDelete={canDelete}
          isLast={i === events.length - 1}
        />
      ))}
    </div>
  );
}
