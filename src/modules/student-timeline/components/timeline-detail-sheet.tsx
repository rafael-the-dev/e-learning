"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/shared/components/ui/sheet";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import { TimelineEventIcon } from "./timeline-event-icon";
import {
  TIMELINE_EVENT_TYPE_LABELS,
  TIMELINE_REFERENCE_TYPE_LABELS,
  TIMELINE_VISIBILITY_LABELS,
  TIMELINE_EVENT_MODULE,
} from "@/modules/student-timeline/types";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="font-medium break-all">{value}</dd>
    </div>
  );
}

export function TimelineDetailSheet({
  event,
  open,
  onOpenChange,
}: {
  event: StudentTimelineEvent;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const label = TIMELINE_EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
  const moduleLabel = TIMELINE_EVENT_MODULE[event.eventType] ?? "—";
  const visibilityLabel = TIMELINE_VISIBILITY_LABELS[event.visibility] ?? event.visibility;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center gap-3 mb-2">
            <TimelineEventIcon eventType={event.eventType} size="lg" />
            <div>
              <SheetTitle className="text-base">{event.title}</SheetTitle>
              <SheetDescription className="text-xs">{label}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-5">
          {event.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
          )}

          <Separator />

          <dl className="space-y-3">
            <MetaRow
              label="Data"
              value={new Date(event.occurredAt).toLocaleString("pt-PT", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            />
            <MetaRow label="Módulo" value={moduleLabel} />
            <MetaRow label="Visibilidade" value={visibilityLabel} />
            {event.referenceType && (
              <MetaRow
                label="Referência"
                value={
                  <span>
                    {TIMELINE_REFERENCE_TYPE_LABELS[event.referenceType] ?? event.referenceType}
                    {event.referenceId && (
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {event.referenceId}
                      </span>
                    )}
                  </span>
                }
              />
            )}
            {event.actorName && <MetaRow label="Autor" value={event.actorName} />}
            {event.sourceEventId && (
              <MetaRow
                label="Evento de origem"
                value={
                  <span className="font-mono text-xs break-all">{event.sourceEventId}</span>
                }
              />
            )}
          </dl>

          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Metadados
                </p>
                <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto font-mono leading-relaxed">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </div>
            </>
          )}

          <Separator />

          <dl className="space-y-3">
            <MetaRow
              label="Criado a"
              value={new Date(event.createdAt).toLocaleString("pt-PT", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            />
            <MetaRow label="ID" value={<span className="font-mono text-xs">{event.id}</span>} />
          </dl>
        </div>
      </SheetContent>
    </Sheet>
  );
}
