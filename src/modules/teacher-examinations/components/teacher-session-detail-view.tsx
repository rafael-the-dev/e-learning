import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { TeacherExamSessionDetailDto } from "@/modules/teacher-examinations/types";
import { TeacherExamCapabilitiesPanel } from "./teacher-exam-capabilities-panel";
import { TeacherAttendanceSection } from "./teacher-attendance-section";
import {
  SessionStatusBadge,
  RoleBadge,
  formatExamDate,
  formatExamTime,
  formatExamDuration,
} from "./teacher-exam-status-labels";

// Read-only session detail composition for
// /teacher/examinations/sessions/[sessionId]. No admin config, integrations,
// appeals or publication — and no mutation buttons (Sprint 1).

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

export function TeacherSessionDetailView({ session }: { session: TeacherExamSessionDetailDto }) {
  const duration = formatExamDuration(session.durationMinutes);
  const progress = session.progress;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold tracking-tight">
                {session.subjectName ?? session.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatExamDate(session.startsAt)} · {formatExamTime(session.startsAt)}
                {session.roomName ? ` · ${session.roomName}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge status={session.role} />
              <SessionStatusBadge status={session.sessionStatus} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Informações da sessão */}
        <SectionCard title="Informações da sessão">
          <InfoRow label="Curso" value={session.courseName ?? "—"} />
          <InfoRow label="Nível" value={session.levelName ?? "—"} />
          <InfoRow label="Disciplina" value={session.subjectName ?? "—"} />
          <InfoRow label="Época" value={session.periodName ?? "—"} />
          <InfoRow label="Duração" value={duration ?? "—"} />
          <InfoRow label="Sala" value={session.roomName ?? "—"} />
        </SectionCard>

        {/* Instruções */}
        <SectionCard title="Instruções">
          {session.instructions ? (
            <p className="whitespace-pre-wrap text-sm">{session.instructions}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Sem instruções.</p>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* As tuas capacidades */}
        <TeacherExamCapabilitiesPanel capabilities={session.capabilities} />

        {/* Progresso */}
        <SectionCard title="Progresso">
          <InfoRow label="Candidatos" value={progress.candidateCount} />
          <InfoRow label="Presenças marcadas" value={progress.attendanceMarked} />
          <InfoRow label="Resultados em rascunho" value={progress.resultsDraft} />
          <InfoRow label="Resultados submetidos" value={progress.resultsSubmitted} />
        </SectionCard>
      </div>

      {/* Assiduidade (Sprint 2 — escrita) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Assiduidade</CardTitle>
        </CardHeader>
        <CardContent>
          <TeacherAttendanceSection sessionId={session.examSessionId} />
        </CardContent>
      </Card>
    </div>
  );
}
