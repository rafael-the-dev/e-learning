import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { StudentExamOverviewDto } from "@/modules/student-examinations/types";
import { formatExamDate, formatExamTime } from "./student-exam-status-labels";

// Compact dashboard card for the student home. Shows the next exam and the
// "resultados por publicar" count, with a link into the full exam portal.

export function StudentExamSummaryCard({ overview }: { overview: StudentExamOverviewDto }) {
  const next = overview.nextExam;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Exames</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Próximo exame</p>
          {next ? (
            <>
              <p className="text-sm font-semibold">{next.subjectName ?? next.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatExamDate(next.startsAt)} · {formatExamTime(next.startsAt)}
                {next.roomName ? ` · ${next.roomName}` : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Sem exames agendados.</p>
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">Resultados por publicar</span>
          <span className="font-semibold tabular-nums">{overview.resultsPendingPublication}</span>
        </div>

        <Link
          href="/student/examinations"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Ver todos os exames <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
