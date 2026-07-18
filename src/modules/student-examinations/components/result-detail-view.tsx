import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { StudentExamResultDetailDto } from "@/modules/student-examinations/types";
import { AppealCreateForm } from "./appeal-create-form";
import {
  AppealStatusBadge,
  ResultCodeBadge,
  formatExamDate,
} from "./student-exam-status-labels";

// Read-only result-detail composition for
// /student/examinations/results/[resultId]. The normalized score is ALWAYS
// "Percentagem do exame" — never a final subject grade. No pass/fail anywhere.

function StatCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

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
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export function ResultDetailView({ result }: { result: StudentExamResultDetailDto }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {result.subjectName ?? "Resultado do exame"}
        </h1>
        <p className="text-sm text-muted-foreground">Resultado do exame</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Nota obtida"
          value={result.score != null ? `${result.score}/${result.maxScore}` : "—"}
        />
        <StatCard label="Nota máxima" value={result.maxScore} />
        <StatCard
          label="Percentagem do exame"
          value={result.normalizedScore != null ? `${result.normalizedScore}%` : "—"}
        />
        <StatCard
          label="Resultado"
          value={<ResultCodeBadge status={result.resultCode} />}
        />
      </div>

      {/* Informações do exame */}
      <SectionCard title="Informações do exame">
        <InfoRow label="Curso" value={result.courseName ?? "—"} />
        <InfoRow label="Nível" value={result.levelName ?? "—"} />
        <InfoRow label="Data do exame" value={formatExamDate(result.sessionDate)} />
        <InfoRow
          label="Publicado"
          value={result.publishedAt ? formatExamDate(result.publishedAt) : "—"}
        />
      </SectionCard>

      {/* Observação pública — only when present (null in v1 → hidden) */}
      {result.publicComment && (
        <SectionCard title="Observação pública">
          <p className="whitespace-pre-wrap text-sm">{result.publicComment}</p>
        </SectionCard>
      )}

      {/* Recurso relacionado */}
      <SectionCard title="Recurso relacionado">
        {result.appeal ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1 text-sm">
              <AppealStatusBadge status={result.appeal.status} />
              <span className="text-muted-foreground">
                Submetido em {formatExamDate(result.appeal.submittedAt)}
              </span>
            </div>
            <Link
              href={`/student/examinations/appeals/${result.appeal.appealId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver recurso <ArrowRight className="size-4" />
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sem recurso para este resultado.</p>
        )}
      </SectionCard>

      {/* Próxima ação */}
      <SectionCard title="Próxima ação">
        {result.canCreateAppeal ? (
          <AppealCreateForm examResultId={result.examResultId} />
        ) : result.createAppealBlockedReason ? (
          <p className="text-sm text-muted-foreground">{result.createAppealBlockedReason}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Não existem ações disponíveis para este resultado.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
