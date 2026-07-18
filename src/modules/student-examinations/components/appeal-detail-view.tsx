import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import type { StudentExamAppealDetailDto } from "@/modules/student-examinations/types";
import { WithdrawAppealButton } from "./withdraw-appeal-button";
import {
  AppealStatusBadge,
  AppealDecisionBadge,
  formatExamDate,
} from "./student-exam-status-labels";

// Read-only appeal-detail composition for
// /student/examinations/appeals/[appealId]. Shows ONLY student-visible fields —
// never internal notes, admin actors, audit, or the private decision reason.

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

// Derive the 3-step progress purely from the appeal status + decision date.
const DECIDED = ["APPROVED", "REJECTED", "CLOSED", "WITHDRAWN"];
const REVIEWING = ["UNDER_REVIEW", "APPROVED", "REJECTED", "CLOSED"];

function AppealTimeline({ appeal }: { appeal: StudentExamAppealDetailDto }) {
  const steps: Array<{ label: string; done: boolean; date: Date | null }> = [
    { label: "Submetido", done: true, date: appeal.submittedAt },
    { label: "Em análise", done: REVIEWING.includes(appeal.status), date: null },
    {
      label: "Decidido",
      done: appeal.decidedAt != null || DECIDED.includes(appeal.status),
      date: appeal.decidedAt,
    },
  ];

  return (
    <ol className="space-y-4">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              step.done
                ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                : "border-muted-foreground/30 bg-muted text-muted-foreground"
            )}
          >
            {step.done ? <Check className="size-4" /> : index + 1}
          </span>
          <div className="flex flex-col">
            <span
              className={cn(
                "text-sm font-medium",
                step.done ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {step.date && (
              <span className="text-xs text-muted-foreground">{formatExamDate(step.date)}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AppealDetailView({ appeal }: { appeal: StudentExamAppealDetailDto }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {appeal.subjectName ?? "Recurso"}
          </h1>
          <p className="text-sm text-muted-foreground">Recurso de exame</p>
        </div>
        <AppealStatusBadge status={appeal.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Detalhes */}
        <SectionCard title="Detalhes do recurso">
          <InfoRow label="Disciplina" value={appeal.subjectName ?? "—"} />
          <InfoRow
            label="Data do exame"
            value={appeal.sessionDate ? formatExamDate(appeal.sessionDate) : "—"}
          />
          <InfoRow label="Data de submissão" value={formatExamDate(appeal.submittedAt)} />
          <InfoRow label="Estado" value={<AppealStatusBadge status={appeal.status} />} />
          <InfoRow
            label="Decisão pública"
            value={
              appeal.publicDecision ? (
                <AppealDecisionBadge status={appeal.publicDecision} />
              ) : (
                "—"
              )
            }
          />
          <InfoRow
            label="Data da decisão"
            value={appeal.decidedAt ? formatExamDate(appeal.decidedAt) : "—"}
          />
          <div className="pt-1">
            <Link
              href={`/student/examinations/results/${appeal.examResultId}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver resultado do exame <ArrowRight className="size-4" />
            </Link>
          </div>
        </SectionCard>

        {/* Progresso */}
        <SectionCard title="Progresso">
          <AppealTimeline appeal={appeal} />
        </SectionCard>
      </div>

      {/* Motivo */}
      <SectionCard title="Motivo do recurso">
        <p className="whitespace-pre-wrap text-sm">{appeal.reason}</p>
      </SectionCard>

      {/* Ação */}
      <SectionCard title="Ação">
        {appeal.canWithdraw ? (
          <WithdrawAppealButton appealId={appeal.appealId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {appeal.withdrawBlockedReason ?? "Não existem ações disponíveis para este recurso."}
          </p>
        )}
      </SectionCard>
    </div>
  );
}
