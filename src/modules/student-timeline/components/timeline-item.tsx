"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { TimelineEventIcon } from "./timeline-event-icon";
import { TimelineDetailSheet } from "./timeline-detail-sheet";
import {
  TIMELINE_EVENT_TYPE_LABELS,
  TIMELINE_REFERENCE_TYPE_LABELS,
  TIMELINE_EVENT_MODULE,
} from "@/modules/student-timeline/types";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";
import { deleteManualNoteAction } from "@/modules/student-timeline/actions/student-timeline.actions";
import { cn } from "@/shared/lib/utils";

export function TimelineItem({
  event,
  canDelete,
  isLast,
}: {
  event: StudentTimelineEvent;
  canDelete: boolean;
  isLast: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Eliminar esta nota? Esta ação não pode ser revertida.")) return;
    setDeleting(true);
    const result = await deleteManualNoteAction(event.id);
    if (!result.success) {
      alert(result.error ?? "Erro ao eliminar nota");
    }
    setDeleting(false);
  }

  const label = TIMELINE_EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
  const moduleLabel = TIMELINE_EVENT_MODULE[event.eventType] ?? "";

  return (
    <>
      <div className="relative flex gap-4 group">
        {/* Vertical connector line */}
        {!isLast && (
          <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />
        )}

        <TimelineEventIcon eventType={event.eventType} size="md" />

        <div
          className={cn(
            "flex-1 min-w-0 pb-6 cursor-pointer",
            "rounded-lg border bg-card px-4 py-3 transition-colors",
            "hover:bg-accent/30"
          )}
          onClick={() => setOpen(true)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <span className="text-sm font-medium leading-snug">{event.title}</span>
                {event.visibility === "STUDENT_VISIBLE" && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 border-emerald-300 text-emerald-600">
                    Visível ao aluno
                  </Badge>
                )}
              </div>

              {event.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(event.occurredAt).toLocaleString("pt-PT", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>

                <span className="text-xs text-muted-foreground">·</span>

                <span className="text-xs text-muted-foreground">{moduleLabel}</span>

                {event.referenceType && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {TIMELINE_REFERENCE_TYPE_LABELS[event.referenceType] ?? event.referenceType}
                    </span>
                  </>
                )}

                {event.actorName && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{event.actorName}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              {canDelete && event.eventType === "MANUAL_NOTE" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <TimelineDetailSheet event={event} open={open} onOpenChange={setOpen} />
    </>
  );
}
