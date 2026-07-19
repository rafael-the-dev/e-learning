import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import type { GuardianExamStudentSummaryDto } from "@/modules/guardian-examinations/types";
import {
  RelationshipBadge,
  ResultCodeBadge,
  formatExamDate,
  formatExamTime,
} from "./guardian-exam-status-labels";

// =============================================================================
// GUARDIAN STUDENT EXAM CARD — per-student supervision summary (READ-ONLY)
// -----------------------------------------------------------------------------
// One card per linked student. Purely presentational and NON-interactive: no
// buttons, no action links, no deep-links (those arrive in Sprint 2). When the
// link has no academic visibility, ALL exam data is withheld — only the muted
// gate message (from `alerts`) is shown.
// =============================================================================

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function GuardianStudentExamCard({ summary }: { summary: GuardianExamStudentSummaryDto }) {
  const { student, academicVisible, nextExam, examsThisWeek, latestResults, pendingAppeals, alerts } =
    summary;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base font-semibold">{student.studentName}</CardTitle>
          {student.isPrimary && <Badge variant="info">Principal</Badge>}
          <RelationshipBadge status={student.relationshipType} />
        </div>
        {student.studentNumber && (
          <p className="text-xs text-muted-foreground">Nº {student.studentNumber}</p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {!academicVisible ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {alerts[0] ?? "Sem visibilidade académica para este educando."}
          </p>
        ) : (
          <>
            {/* Próximo exame */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Próximo exame</p>
              {nextExam ? (
                <>
                  <p className="text-sm font-semibold">{nextExam.subjectName ?? "Exame"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatExamDate(nextExam.startsAt)} · {formatExamTime(nextExam.startsAt)}
                    {nextExam.roomName ? ` · ${nextExam.roomName}` : ""}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sem exames agendados.</p>
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <InfoRow label="Exames esta semana" value={examsThisWeek} />
              <InfoRow label="Recursos por decidir" value={pendingAppeals} />
            </div>

            {/* Últimos resultados */}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Últimos resultados</p>
              {latestResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem resultados publicados.</p>
              ) : (
                <ul className="divide-y">
                  {latestResults.map((result) => (
                    <li
                      key={result.examResultId}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{result.subjectName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">
                          Percentagem:{" "}
                          {result.normalizedScore != null ? `${result.normalizedScore}%` : "—"}
                          {result.publishedAt
                            ? ` · ${formatExamDate(result.publishedAt)}`
                            : ""}
                        </p>
                      </div>
                      <ResultCodeBadge status={result.resultCode} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Alertas */}
            {alerts.length > 0 && (
              <ul className="space-y-2 border-t pt-3">
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
