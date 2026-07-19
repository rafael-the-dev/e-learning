import type { ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import type { StudentExamDetailDto } from "@/modules/student-examinations/types";
import { ExamTimeline } from "./exam-timeline";
import {
  SessionStatusBadge,
  ResultCodeBadge,
  translateEligibilityBlocker,
  formatExamDate,
  formatExamTime,
  formatExamDuration,
} from "./student-exam-status-labels";

// Read-only exam detail composition for /student/examinations/[examId].

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

export function ExamDetailView({ exam }: { exam: StudentExamDetailDto }) {
  const duration = formatExamDuration(exam.durationMinutes);
  const period =
    exam.periodName ??
    ([exam.academicYear, exam.term].filter(Boolean).join(" · ") || null);

  return (
    <div className="space-y-6">
      {/* (a) Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {exam.subjectName ?? exam.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatExamDate(exam.startsAt)} · {formatExamTime(exam.startsAt)}
                {exam.roomName ? ` · ${exam.roomName}` : ""}
              </p>
            </div>
            <SessionStatusBadge status={exam.sessionStatus} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* (b) Informações */}
        <SectionCard title="Informações">
          <InfoRow label="Curso" value={exam.courseName ?? "—"} />
          <InfoRow label="Nível" value={exam.levelName ?? "—"} />
          <InfoRow label="Disciplina" value={exam.subjectName ?? "—"} />
          <InfoRow label="Época" value={period ?? "—"} />
        </SectionCard>

        {/* (c) Informações para o exame */}
        <SectionCard title="Informações para o exame">
          <div className="space-y-1 text-sm">
            <span className="text-muted-foreground">Instruções</span>
            {exam.instructions ? (
              <p className="whitespace-pre-wrap">{exam.instructions}</p>
            ) : (
              <p className="text-muted-foreground">Sem instruções.</p>
            )}
          </div>
          <InfoRow label="Duração" value={duration ?? "—"} />
          <InfoRow label="Sala" value={exam.roomName ?? "—"} />
        </SectionCard>
      </div>

      {/* (d) Elegibilidade */}
      <SectionCard title="Elegibilidade">
        {exam.eligibility.eligible ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3.5" /> Elegível
          </Badge>
        ) : (
          <div className="space-y-2">
            <Badge variant="destructive" className="gap-1">
              <XCircle className="size-3.5" /> Não elegível
            </Badge>
            {exam.eligibility.blockers.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {exam.eligibility.blockers.map((code) => (
                  <li key={code}>{translateEligibilityBlocker(code)}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sem motivos detalhados. Contacta a secretaria para mais informações.
              </p>
            )}
          </div>
        )}
      </SectionCard>

      {/* (e) Timeline */}
      <SectionCard title="Estado">
        <ExamTimeline timeline={exam.timeline} />
      </SectionCard>

      {/* (f) Result summary — only when a PUBLISHED result exists */}
      {exam.result && (
        <SectionCard title="Resultado">
          <InfoRow
            label="Percentagem do exame"
            value={exam.result.normalizedScore != null ? `${exam.result.normalizedScore}%` : "—"}
          />
          <InfoRow
            label="Nota"
            value={
              exam.result.score != null
                ? `${exam.result.score}/${exam.result.maxScore}`
                : "—"
            }
          />
          <InfoRow label="Resultado" value={<ResultCodeBadge status={exam.result.resultCode} />} />
          {exam.result.publishedAt && (
            <InfoRow label="Publicado" value={formatExamDate(exam.result.publishedAt)} />
          )}
        </SectionCard>
      )}
    </div>
  );
}
