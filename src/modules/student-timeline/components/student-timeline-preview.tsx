import Link from "next/link";
import { History } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { TimelineEventIcon } from "./timeline-event-icon";
import { TIMELINE_EVENT_TYPE_LABELS } from "@/modules/student-timeline/types";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";

export function StudentTimelinePreview({
  events,
  studentId,
}: {
  events: StudentTimelineEvent[];
  studentId: string;
}) {
  return (
    <div className="rounded-xl border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Timeline</h3>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/students/${studentId}/timeline`}>Ver timeline</Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum evento registado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-2.5">
              <TimelineEventIcon eventType={event.eventType} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-medium leading-snug truncate">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.occurredAt).toLocaleDateString("pt-PT")}
                  {" · "}
                  {TIMELINE_EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
