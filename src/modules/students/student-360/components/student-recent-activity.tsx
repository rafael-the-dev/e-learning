import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { TimelineEventIcon } from "@/modules/student-timeline/components/timeline-event-icon";
import { TIMELINE_EVENT_TYPE_LABELS } from "@/modules/student-timeline/types";
import { History } from "lucide-react";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";

// Page-level "atividade recente" (H7) — the last few relevant events. Detail (paginated,
// full) lives in the Histórico tab; this is a compact glance only.
export function StudentRecentActivity({
  studentId,
  events,
}: {
  studentId: string;
  events: StudentTimelineEvent[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Atividade Recente</CardTitle>
          </div>
          <Link href={`/students/${studentId}/timeline`} className="text-xs text-primary hover:underline">
            Ver timeline completa
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento registado ainda.</p>
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
      </CardContent>
    </Card>
  );
}
