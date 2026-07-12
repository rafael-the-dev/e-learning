import Link from "next/link";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { examinationOperationsReadService } from "@/modules/examinations/services/admin/examination-operations-read.service";
import { ExaminationPageHeader } from "@/modules/examinations/components/examination-page-header";
import { ExaminationKpiCard, ExaminationSummaryCard } from "@/modules/examinations/components/examination-cards";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type { ExamConflictSessionRef } from "@/modules/examinations/types/portal";

export const metadata = { title: "Exames — Operações" };

const fmt = (d: Date | string) => new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

// Each detected gap links straight to the session (optionally to a specific tab),
// so detection leads to the fix instead of a dead end.
function SessionRefList({
  title,
  sessions,
  tab,
}: {
  title: string;
  sessions: ExamConflictSessionRef[];
  tab?: string;
}) {
  return (
    <ExaminationSummaryCard title={`${title} (${sessions.length})`}>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem ocorrências.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {sessions.map((s) => (
            <li key={s.sessionId} className="rounded border p-2 hover:bg-muted/40">
              <Link
                href={`/examinations/sessions/${s.sessionId}${tab ? `?tab=${tab}` : ""}`}
                className="flex items-center justify-between gap-3"
              >
                <span className="font-medium text-foreground underline-offset-2 hover:underline">{s.title}</span>
                <span className="text-xs text-muted-foreground">{fmt(s.startsAt)} – {fmt(s.endsAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ExaminationSummaryCard>
  );
}

export default async function ExamOperationsPage() {
  // Operations is a distinct, higher-privilege surface (detection only — no mutations here).
  const context = await requirePermissionOrRedirect(PERMISSIONS.EXAMS_OPERATIONS_VIEW);
  const [conflicts, health] = await Promise.all([
    examinationOperationsReadService.getConflicts(context),
    examinationOperationsReadService.getIntegrationHealth(context),
  ]);

  return (
    <div className="space-y-6">
      <ExaminationPageHeader title="Operações de Exame" description="Deteção de conflitos e saúde da integração. Apenas leitura." />

      {/* ── Agendamento ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Agendamento</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <SessionRefList title="Sessões sem sala" sessions={conflicts.sessionsWithoutRoom} />
          <SessionRefList title="Sessões sem vigilantes" sessions={conflicts.sessionsWithoutInvigilators} tab="invigilators" />
          <SessionRefList title="Sessões acima da capacidade" sessions={conflicts.overCapacitySessions} />
          <SessionRefList title="Sessões fora da janela do período" sessions={conflicts.sessionsOutsidePeriodWindow} />
        </div>
      </section>

      {/* ── Conflitos ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Conflitos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ExaminationSummaryCard title={`Conflitos de sala (${conflicts.counts.roomConflicts})`}>
            {conflicts.roomConflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem conflitos de sala.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {conflicts.roomConflicts.map((c) => (
                  <li key={c.roomId} className="rounded border p-2">
                    <p className="text-xs font-medium text-muted-foreground">Sala {c.roomId}</p>
                    {c.sessions.map((s) => (
                      <div key={s.sessionId} className="flex justify-between"><span>{s.title}</span><span className="text-xs text-muted-foreground">{fmt(s.startsAt)}</span></div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </ExaminationSummaryCard>
          <ExaminationSummaryCard title={`Conflitos de vigilantes (${conflicts.counts.invigilatorConflicts})`}>
            {conflicts.invigilatorConflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem conflitos de vigilantes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {conflicts.invigilatorConflicts.map((c) => (
                  <li key={c.invigilatorId} className="rounded border p-2">
                    <p className="text-xs font-medium text-muted-foreground">Vigilante {c.invigilatorId}</p>
                    {c.sessions.map((s) => (
                      <div key={s.sessionId} className="flex justify-between"><span>{s.title}</span><span className="text-xs text-muted-foreground">{fmt(s.startsAt)}</span></div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </ExaminationSummaryCard>
        </div>
      </section>

      {/* ── Saúde da integração ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Saúde da integração</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <ExaminationKpiCard label="Associações em falta" value={health.missingBindings} />
          <ExaminationKpiCard label="Resultados não suportados" value={health.unsupportedResults} />
          <ExaminationKpiCard label="Integrações desatualizadas" value={health.staleIntegrations} />
          <ExaminationKpiCard label="Integrações falhadas" value={health.failedIntegrations} />
          <ExaminationKpiCard label="Publicações consumidas" value={health.consumedPublications} />
          <ExaminationKpiCard label="Revisões por reconciliar" value={health.unreconciledRevisions} />
        </div>
        <p className="text-xs text-muted-foreground">
          {health.summary.totalPublishedSessions} sessões publicadas · {health.summary.totalPublishedResults} resultados publicados.
        </p>
      </section>

      {conflicts.counts.roomConflicts === 0 &&
        conflicts.counts.invigilatorConflicts === 0 &&
        conflicts.sessionsWithoutRoom.length === 0 &&
        conflicts.sessionsWithoutInvigilators.length === 0 &&
        conflicts.overCapacitySessions.length === 0 &&
        conflicts.sessionsOutsidePeriodWindow.length === 0 && (
          <ExaminationEmptyState title="Nenhum problema de agendamento detetado" description="Todas as sessões têm sala, vigilantes e capacidade dentro dos limites." />
        )}
    </div>
  );
}
