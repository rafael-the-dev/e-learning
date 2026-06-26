import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { CalendarDays, CheckSquare } from "lucide-react";
import { ATTENDANCE_SESSION_STATUS_LABELS } from "@/modules/attendance/types";
import type { TeacherTodaySession } from "@/modules/teacher-portal/types";

const STATUS_BADGE_VARIANT: Record<string, "secondary" | "info" | "success" | "destructive" | "outline"> = {
  DRAFT: "secondary",
  OPEN: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
  ARCHIVED: "outline",
};

interface Props {
  sessions: TeacherTodaySession[];
}

export function TeacherTodaySchedule({ sessions }: Props) {
  return (
    <Card id="today-schedule">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Horário de Hoje</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="size-8" />}
            title="Sem aulas agendadas para hoje."
            className="border-0"
          />
        ) : (
          <ul className="divide-y">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-center gap-3 py-2.5">
                <div className="w-24 shrink-0 text-sm font-medium tabular-nums">
                  {session.startTime}–{session.endTime}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.classGroupName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {session.subjectName}
                    {session.classroomName ? ` · ${session.classroomName}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE_VARIANT[session.status] ?? "secondary"} className="shrink-0">
                  {ATTENDANCE_SESSION_STATUS_LABELS[session.status] ?? session.status}
                </Badge>
                <div className="flex shrink-0 items-center gap-1">
                  {(session.status === "OPEN" || session.status === "DRAFT") && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/attendance/sessions/${session.id}/mark`}>
                        <CheckSquare className="size-3.5" />
                        Marcar
                      </Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/class-groups/${session.classGroupId}`}>Turma</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
