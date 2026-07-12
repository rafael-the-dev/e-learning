"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { ExaminationKpiCard, ExaminationSummaryCard } from "./examination-cards";
import { ExaminationEmptyState } from "./examination-states";
import type {
  ExamConflictSessionRef,
  ExaminationConflictsDto,
  ExaminationIntegrationHealthDto,
} from "@/modules/examinations/types/portal";

// =============================================================================
// OperationsView (Sprint 2.1 P5.6) — names, not UUIDs, + client search.
// Detection-only. Rooms/invigilators show resolved names (ids kept only for the
// links). A single search box filters by session title / room name / invigilator
// name across every conflict section (the data set is already fully loaded).
// =============================================================================

const fmt = (d: Date | string) => new Date(d).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });

function SessionRefList({ title, sessions, tab }: { title: string; sessions: ExamConflictSessionRef[]; tab?: string }) {
  return (
    <ExaminationSummaryCard title={`${title} (${sessions.length})`}>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem ocorrências.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {sessions.map((s) => (
            <li key={s.sessionId} className="rounded border p-2 hover:bg-muted/40">
              <Link href={`/examinations/sessions/${s.sessionId}${tab ? `?tab=${tab}` : ""}`} className="flex items-center justify-between gap-3">
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

export function OperationsView({
  conflicts,
  health,
}: {
  conflicts: ExaminationConflictsDto;
  health: ExaminationIntegrationHealthDto;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const sessionMatch = (s: ExamConflictSessionRef): boolean => !q || s.title.toLowerCase().includes(q);
  const refList = (list: ExamConflictSessionRef[]): ExamConflictSessionRef[] => list.filter(sessionMatch);

  const roomConflicts = conflicts.roomConflicts.filter(
    (c) => !q || (c.roomName ?? "").toLowerCase().includes(q) || c.sessions.some(sessionMatch)
  );
  const invigilatorConflicts = conflicts.invigilatorConflicts.filter(
    (c) => !q || (c.invigilatorName ?? "").toLowerCase().includes(q) || c.sessions.some(sessionMatch)
  );
  const withoutRoom = refList(conflicts.sessionsWithoutRoom);
  const withoutInvig = refList(conflicts.sessionsWithoutInvigilators);
  const overCapacity = refList(conflicts.overCapacitySessions);
  const outsideWindow = refList(conflicts.sessionsOutsidePeriodWindow);

  const schedulingClear =
    withoutRoom.length === 0 && withoutInvig.length === 0 && overCapacity.length === 0 && outsideWindow.length === 0;
  const conflictsClear = roomConflicts.length === 0 && invigilatorConflicts.length === 0;
  const nothingForSearch = q.length > 0 && schedulingClear && conflictsClear;

  return (
    <div className="space-y-6">
      <div className="relative min-w-55 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Pesquisar por sessão, sala ou vigilante…"
          className="pl-8"
          aria-label="Pesquisar operações"
        />
      </div>

      {nothingForSearch && (
        <ExaminationEmptyState title={`Sem resultados para «${query.trim()}»`} description="Nenhuma sessão, sala ou vigilante corresponde à pesquisa." />
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Agendamento</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <SessionRefList title="Sessões sem sala" sessions={withoutRoom} />
          <SessionRefList title="Sessões sem vigilantes" sessions={withoutInvig} tab="invigilators" />
          <SessionRefList title="Sessões acima da capacidade" sessions={overCapacity} />
          <SessionRefList title="Sessões fora da janela do período" sessions={outsideWindow} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Conflitos</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <ExaminationSummaryCard title={`Conflitos de sala (${roomConflicts.length})`}>
            {roomConflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem conflitos de sala.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {roomConflicts.map((c) => (
                  <li key={c.roomId} className="rounded border p-2">
                    <p className="text-xs font-medium text-muted-foreground">Sala: {c.roomName ?? "—"}</p>
                    {c.sessions.map((s) => (
                      <div key={s.sessionId} className="flex justify-between"><span>{s.title}</span><span className="text-xs text-muted-foreground">{fmt(s.startsAt)}</span></div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </ExaminationSummaryCard>
          <ExaminationSummaryCard title={`Conflitos de vigilantes (${invigilatorConflicts.length})`}>
            {invigilatorConflicts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem conflitos de vigilantes.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {invigilatorConflicts.map((c) => (
                  <li key={c.invigilatorId} className="rounded border p-2">
                    <p className="text-xs font-medium text-muted-foreground">Vigilante: {c.invigilatorName ?? "—"}</p>
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

      {!q && schedulingClear && conflictsClear && (
        <ExaminationEmptyState title="Nenhum problema de agendamento detetado" description="Todas as sessões têm sala, vigilantes e capacidade dentro dos limites." />
      )}
    </div>
  );
}
