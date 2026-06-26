import Link from "next/link";
import { Card, CardContent } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Button } from "@/shared/components/ui/button";
import {
  History,
  BookOpen,
  Users,
  ClipboardList,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { TeacherTimelineItem } from "@/modules/teachers/teacher-360/types";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  TEACHER_CREATED: <Users className="size-4" />,
  SUBJECT_ASSIGNED: <BookOpen className="size-4" />,
  CLASS_GROUP_ASSIGNED: <Users className="size-4" />,
  ASSESSMENT_CREATED: <ClipboardList className="size-4" />,
  ASSESSMENT_PUBLISHED: <CheckCircle2 className="size-4" />,
  ATTENDANCE_RECORDED: <ClipboardCheck className="size-4" />,
  DOCUMENT_UPLOADED: <FileText className="size-4" />,
};

interface TeacherTimelineTabProps {
  events: TeacherTimelineItem[];
  total: number;
  page: number;
  pageSize: number;
}

export function TeacherTimelineTab({ events, total, page, pageSize }: TeacherTimelineTabProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (events.length === 0) {
    return <EmptyState icon={<History className="size-8" />} title="Sem eventos registados" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <ol className="relative border-l pl-6 space-y-6">
            {events.map((event) => (
              <li key={event.id} className="relative">
                <span className="absolute -left-[2.05rem] top-0 flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  {EVENT_ICONS[event.eventType] ?? <History className="size-4" />}
                </span>
                <p className="text-sm font-medium">{event.title}</p>
                {event.description && <p className="text-xs text-muted-foreground">{event.description}</p>}
                <p className="text-xs text-muted-foreground">
                  {new Date(event.occurredAt).toLocaleString("pt-PT")}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>Página {page} de {totalPages}</span>
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Button asChild variant="outline" size="icon" className="size-7">
                <Link href={`?tab=timeline&page=${page - 1}`}>
                  <ChevronLeft className="size-3.5" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon" className="size-7" disabled>
                <ChevronLeft className="size-3.5" />
              </Button>
            )}
            {page < totalPages ? (
              <Button asChild variant="outline" size="icon" className="size-7">
                <Link href={`?tab=timeline&page=${page + 1}`}>
                  <ChevronRight className="size-3.5" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon" className="size-7" disabled>
                <ChevronRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
