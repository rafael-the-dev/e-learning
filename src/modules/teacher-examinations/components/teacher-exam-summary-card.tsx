import Link from "next/link";
import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { TeacherExamOverviewDto } from "@/modules/teacher-examinations/types";
import { formatExamDate, formatExamTime, RoleBadge } from "./teacher-exam-status-labels";

// Compact dashboard card for the teacher home (/teacher). Shows the next assigned
// exam and a link into the full exam portal. Read-only.

export function TeacherExamSummaryCard({ overview }: { overview: TeacherExamOverviewDto }) {
  const next = overview.nextSession;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Exames</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Próximo exame atribuído</p>
          {next ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{next.subjectName ?? next.title}</p>
                <RoleBadge status={next.role} />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatExamDate(next.startsAt)} · {formatExamTime(next.startsAt)}
                {next.roomName ? ` · ${next.roomName}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sem exames atribuídos.</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Presenças pendentes</span>
          <span className="font-semibold tabular-nums">{overview.attendancePendingCount}</span>
        </div>

        <Link
          href="/teacher/examinations"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Ver os meus exames <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
