import { History } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { IMPORT_JOB_EVENT_LABELS } from "@/modules/import-jobs/types";
import type { ImportJobEventEntry } from "@/modules/import-jobs/types";

interface ImportJobEventsTimelineProps {
  events: ImportJobEventEntry[];
}

function getEventLabel(action: string): string {
  return IMPORT_JOB_EVENT_LABELS[action] ?? action;
}

export function ImportJobEventsTimeline({ events }: ImportJobEventsTimelineProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-8" />}
        title="Sem eventos registados"
        description="Ainda não há eventos de auditoria para esta importação."
      />
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.id} className="rounded-md border p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{getEventLabel(event.action)}</Badge>
              <span className="text-sm text-muted-foreground">
                {event.actorName ?? "Sistema"}
              </span>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {event.createdAt.toLocaleString("pt-PT")}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
