import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { GuardianExamDetailDto } from "@/modules/guardian-examinations/types";
import {
  SessionStatusBadge,
  ResultCodeBadge,
  AppealStatusBadge,
  AppealDecisionBadge,
  AttendanceStatusBadge,
  RelationshipBadge,
  formatExamDate,
  formatExamTime,
  formatExamDuration,
} from "./guardian-exam-status-labels";

// =============================================================================
// GUARDIAN EXAM DETAIL VIEW — supervision, 100% READ-ONLY
// -----------------------------------------------------------------------------
// A guardian follows a linked student's exam: schedule, attendance (gated),
// published result, and appeal STATUS. No writes, no actions, no create/withdraw/
// edit — purely presentational. PT-PT text; English domain values.
// =============================================================================

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

export function GuardianExamDetailView({ detail }: { detail: GuardianExamDetailDto }) {
  const duration = formatExamDuration(detail.durationMinutes);

  return (
    <div className="space-y-6">
      {/* Header — whose exam this is + subject/title + session status */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {detail.student.studentName}
                </span>
                <RelationshipBadge status={detail.student.relationshipType} />
              </div>
              <h1 className="text-xl font-semibold tracking-tight">
                {detail.subjectName ?? detail.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatExamDate(detail.startsAt)} · {formatExamTime(detail.startsAt)}
                {detail.roomName ? ` · ${detail.roomName}` : ""}
              </p>
            </div>
            <SessionStatusBadge status={detail.sessionStatus} />
          </div>
        </CardContent>
      </Card>

      {/* Informação do exame */}
      <SectionCard title="Informação do exame">
        <InfoRow label="Curso" value={detail.courseName ?? "—"} />
        <InfoRow label="Nível" value={detail.levelName ?? "—"} />
        <InfoRow label="Disciplina" value={detail.subjectName ?? "—"} />
        <InfoRow label="Época" value={detail.periodName ?? "—"} />
        <InfoRow label="Duração" value={duration ?? "—"} />
        <InfoRow label="Sala" value={detail.roomName ?? "—"} />
        <div className="space-y-1 border-t pt-2 text-sm">
          <span className="text-muted-foreground">Instruções</span>
          {detail.instructions ? (
            <p className="whitespace-pre-wrap">{detail.instructions}</p>
          ) : (
            <p className="text-muted-foreground">Sem instruções.</p>
          )}
        </div>
      </SectionCard>

      {/* Presença — rendered ONLY when attendance is visible for this link */}
      {detail.attendanceVisible && (
        <SectionCard title="Presença">
          {detail.attendanceStatus ? (
            <InfoRow
              label="Estado"
              value={<AttendanceStatusBadge status={detail.attendanceStatus} />}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sem registo de presença.</p>
          )}
        </SectionCard>
      )}

      {/* Resultado — published only */}
      <SectionCard title="Resultado">
        {detail.result ? (
          <>
            <InfoRow
              label="Nota"
              value={
                detail.result.score != null
                  ? `${detail.result.score}/${detail.result.maxScore}`
                  : "—"
              }
            />
            <InfoRow
              label="Percentagem"
              value={
                detail.result.normalizedScore != null
                  ? `${detail.result.normalizedScore}%`
                  : "—"
              }
            />
            <InfoRow
              label="Código"
              value={<ResultCodeBadge status={detail.result.resultCode} />}
            />
            {detail.result.publishedAt && (
              <InfoRow label="Publicado" value={formatExamDate(detail.result.publishedAt)} />
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem resultado publicado.</p>
        )}
      </SectionCard>

      {/* Recurso — read-only STATUS; no create/withdraw/edit */}
      <SectionCard title="Recurso">
        {detail.appeal ? (
          <>
            <InfoRow
              label="Estado"
              value={<AppealStatusBadge status={detail.appeal.status} />}
            />
            <InfoRow
              label="Decisão"
              value={
                detail.appeal.publicDecision ? (
                  <AppealDecisionBadge status={detail.appeal.publicDecision} />
                ) : (
                  "—"
                )
              }
            />
            <InfoRow
              label="Data de submissão"
              value={formatExamDate(detail.appeal.submittedAt)}
            />
            <InfoRow
              label="Data da decisão"
              value={detail.appeal.decidedAt ? formatExamDate(detail.appeal.decidedAt) : "—"}
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Sem recurso.</p>
        )}
      </SectionCard>
    </div>
  );
}
