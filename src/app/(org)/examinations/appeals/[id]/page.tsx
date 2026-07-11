import { notFound } from "next/navigation";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { examAppealAdminReadService } from "@/modules/examinations/services/admin/exam-appeal-admin-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { ExaminationSummaryCard } from "@/modules/examinations/components/examination-cards";
import { AppealStatusBadge } from "@/modules/examinations/components/status-badges";
import { AppealDecisionPanel } from "@/modules/examinations/components/appeal-decision-panel";
import type { ExamOfficialResultDto } from "@/modules/examinations/types/portal";

export const metadata = { title: "Exames — Recurso" };

const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleString("pt-PT") : "—");

function ResultColumn({ title, result }: { title: string; result: ExamOfficialResultDto | null }) {
  return (
    <div className="flex-1 rounded-md border p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {result ? (
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Origem</span><span>{result.source === "REVISION" ? "Revisão" : "Base"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Pontuação</span><span className="font-medium">{result.score ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Percentagem do exame</span><span className="font-medium">{result.normalizedScore != null ? `${result.normalizedScore}%` : "—"}</span></div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

export default async function ExamAppealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_VIEW);
  const { id } = await params;

  const appeal = await examAppealAdminReadService.getDetail(context, id);
  if (!appeal) notFound();

  return (
    <div className="space-y-4">
      <ExaminationPageHeader
        title="Recurso de Exame"
        description="Comparação entre o resultado original e o resultado oficial atual."
        actions={<AppealStatusBadge status={appeal.status} />}
      />

      <ExaminationSummaryCard
        title="Detalhes do recurso"
        items={[
          { label: "Submetido", value: fmt(appeal.createdAt) },
          { label: "Decidido", value: fmt(appeal.decidedAt) },
          { label: "Decisão", value: appeal.decision ?? "—" },
        ]}
      >
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Motivo</p>
          <p className="text-sm">{appeal.reason}</p>
        </div>
        {appeal.decisionReason && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Motivo da decisão</p>
            <p className="text-sm">{appeal.decisionReason}</p>
          </div>
        )}
      </ExaminationSummaryCard>

      {/* Visual comparison — the original is preserved; a revision NEVER overwrites it. */}
      <ExaminationSummaryCard title="Comparação de resultados">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <ResultColumn title="Resultado original (publicado)" result={appeal.originalResult} />
          <div className="flex items-center justify-center text-muted-foreground">→</div>
          <ResultColumn title="Resultado oficial atual" result={appeal.currentOfficialResult} />
        </div>
        {appeal.revisions.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Revisões (append-only)</p>
            <ul className="space-y-1 text-sm">
              {appeal.revisions.map((r) => (
                <li key={r.revisionId} className="flex justify-between rounded border p-2">
                  <span>#{r.revisionNumber} · {r.sourceType}{r.isCurrent ? " · atual" : ""}</span>
                  <span className="tabular-nums">{r.previousScore ?? "—"} → {r.revisedScore ?? "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ExaminationSummaryCard>

      <AppealDecisionPanel appeal={appeal} />
    </div>
  );
}
