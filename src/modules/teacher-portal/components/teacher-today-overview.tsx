import { Card, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { CalendarClock, AlertTriangle } from "lucide-react";
import type { TeacherTodayOverview } from "@/modules/teacher-portal/types";

interface Props {
  overview: TeacherTodayOverview;
}

export function TeacherTodayOverviewCard({ overview }: Props) {
  const dateLabel = overview.today.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground capitalize">{dateLabel}</p>
          {overview.nextSession ? (
            <p className="text-lg font-semibold">
              Próxima aula: {overview.nextSession.startTime} — {overview.nextSession.classGroupName}
              <span className="text-muted-foreground font-normal"> ({overview.nextSession.subjectName})</span>
            </p>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">Sem aulas agendadas para hoje.</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <CalendarClock className="size-3.5" />
            {overview.classesTodayCount} {overview.classesTodayCount === 1 ? "aula hoje" : "aulas hoje"}
          </Badge>
          {overview.attendancePendingCount > 0 && (
            <Badge variant="warning">{overview.attendancePendingCount} presenças pendentes</Badge>
          )}
          {overview.assessmentsToGradeCount > 0 && (
            <Badge variant="info">{overview.assessmentsToGradeCount} avaliações por corrigir</Badge>
          )}
          {overview.urgentAlertCount > 0 && (
            <Badge variant="destructive" className="gap-1.5">
              <AlertTriangle className="size-3.5" />
              {overview.urgentAlertCount} {overview.urgentAlertCount === 1 ? "alerta urgente" : "alertas urgentes"}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
