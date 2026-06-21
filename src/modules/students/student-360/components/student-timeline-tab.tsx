import Link from "next/link";
import { Button } from "@/shared/components/ui/button";
import { TimelineList } from "@/modules/student-timeline/components/timeline-list";
import { AddNoteButton } from "@/modules/student-timeline/components/add-note-button";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import type { StudentTimelineEvent } from "@/modules/student-timeline/types";

interface StudentTimelineTabProps {
  studentId: string;
  events: StudentTimelineEvent[];
  total: number;
  page: number;
  pageSize: number;
  canCreateNote: boolean;
  canDeleteNote: boolean;
}

export function StudentTimelineTab({
  studentId,
  events,
  total,
  page,
  pageSize,
  canCreateNote,
  canDeleteNote,
}: StudentTimelineTabProps) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {total === 0 ? "Nenhum evento encontrado" : total === 1 ? "1 evento" : `${total} eventos`}
        </span>
        <div className="flex items-center gap-2">
          {canCreateNote && <AddNoteButton studentId={studentId} />}
          <Button asChild variant="outline" size="sm">
            <Link href={`/students/${studentId}/timeline`}>
              Ver timeline completa
              <ArrowRight className="size-3.5 ml-1.5" />
            </Link>
          </Button>
        </div>
      </div>

      <TimelineList events={events} canDelete={canDeleteNote} />

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`?tab=timeline&page=${page - 1}`}>
                  <ChevronLeft className="size-4 mr-1" />
                  Anterior
                </Link>
              </Button>
            )}
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={`?tab=timeline&page=${page + 1}`}>
                  Seguinte
                  <ChevronRight className="size-4 ml-1" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
