import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type {
  StudentExamListItemDto,
  StudentExamResultListItemDto,
} from "@/modules/student-examinations/types";
import {
  SessionStatusBadge,
  ResultCodeBadge,
  formatExamDate,
  formatExamTime,
} from "./student-exam-status-labels";

// Overview short-lists + alerts. Presentational, action-oriented — each upcoming
// row links into the exam detail.

export function NextExamHighlight({ exam }: { exam: StudentExamListItemDto }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Próximo exame</CardTitle>
      </CardHeader>
      <CardContent>
        <Link
          href={`/student/examinations/${exam.examCandidateId}`}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4 transition-colors hover:bg-muted/50"
        >
          <div className="space-y-1">
            <p className="font-semibold">{exam.subjectName ?? exam.title}</p>
            <p className="text-sm text-muted-foreground">
              {formatExamDate(exam.startsAt)} · {formatExamTime(exam.startsAt)}
              {exam.roomName ? ` · ${exam.roomName}` : ""}
            </p>
          </div>
          <SessionStatusBadge status={exam.sessionStatus} />
        </Link>
      </CardContent>
    </Card>
  );
}

export function UpcomingShortList({ items }: { items: StudentExamListItemDto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Próximos exames</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <ExaminationEmptyState
            title="Não tens exames agendados."
            description="Os teus próximos exames aparecerão aqui quando fores inscrito."
          />
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.examCandidateId}>
                <Link
                  href={`/student/examinations/${item.examCandidateId}`}
                  className="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.subjectName ?? item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatExamDate(item.startsAt)} · {formatExamTime(item.startsAt)}
                    </p>
                  </div>
                  <SessionStatusBadge status={item.sessionStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function LatestResultsShortList({ items }: { items: StudentExamResultListItemDto[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Últimos resultados</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <ExaminationEmptyState
            title="Ainda não tens resultados publicados."
            description="Assim que a tua escola publicar um resultado, ele aparecerá aqui."
          />
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.examResultId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.subjectName ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    Percentagem: {item.normalizedScore != null ? `${item.normalizedScore}%` : "—"}
                  </p>
                </div>
                <ResultCodeBadge status={item.resultCode} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ExamAlertsCard({ alerts }: { alerts: string[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Alertas</CardTitle>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem alertas.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((alert, index) => (
              <li
                key={index}
                className="rounded-md border-l-4 border-amber-400 bg-amber-50/50 px-3 py-2 text-sm text-amber-800"
              >
                {alert}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
