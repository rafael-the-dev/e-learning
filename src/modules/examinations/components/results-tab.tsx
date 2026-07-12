"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "@/shared/hooks/use-toast";
import { cn } from "@/shared/lib/utils";
import { ExamResultCode } from "@/modules/examinations/constants";
import type { ExamResultListItemDto, PortalListResult } from "@/modules/examinations/types/portal";
import type { BulkSummary } from "@/modules/examinations/lib/bulk-runner";
import { ResultStatusBadge, ExaminationStatusBadge } from "./status-badges";
import { ExaminationEmptyState } from "./examination-states";
import { BulkSummaryDialog } from "./bulk-summary-dialog";

// =============================================================================
// ResultsTab (Sprint 2.1 P2) — a scalable results GRID.
// -----------------------------------------------------------------------------
// • Inline draft entry/edit on ELIGIBLE rows only (create when no result & canCreate,
//   edit when DRAFT & canEdit). SCORED needs a nota; non-scored codes hide it (never 0).
// • Bulk create/update in one call ("Guardar rascunhos").
// • Bulk submit / review / approve over EXPLICIT selection, or over the WHOLE SESSION
//   (clearly distinguished). One HTTP call each; NO optimistic success — the row only
//   changes after the server responds; per-row errors + a succeeded/skipped/failed summary.
// • Load-more reaches results beyond the first page.
// =============================================================================

const RESULT_CODE_LABELS: Record<string, string> = {
  SCORED: "Pontuado",
  ABSENT: "Ausente",
  EXCUSED: "Justificado",
  DISQUALIFIED: "Desqualificado",
};

type Edit = { resultCode: string; score: string; maxScore: string };
type Row = ExamResultListItemDto;

const rowKey = (r: Row): string => r.examResultId ?? r.examCandidateId;
const isEditable = (r: Row): boolean =>
  (!r.examResultId && r.allowedActions.canCreate) || (!!r.examResultId && r.allowedActions.canEdit);

function seedEdits(rows: Row[]): Record<string, Edit> {
  const out: Record<string, Edit> = {};
  for (const r of rows) {
    if (isEditable(r)) {
      out[rowKey(r)] = {
        resultCode: r.resultCode ?? ExamResultCode.SCORED,
        score: r.score != null ? String(r.score) : "",
        maxScore: r.maxScore != null ? String(r.maxScore) : "",
      };
    }
  }
  return out;
}

export function ResultsTab({
  sessionId,
  items,
  page: initialPage,
  total: initialTotal,
}: {
  sessionId: string;
  items: Row[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const [rows, setRows] = useState<Row[]>(items);
  const [edits, setEdits] = useState<Record<string, Edit>>(() => seedEdits(items));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ title: string; data: BulkSummary } | null>(null);
  const [confirm, setConfirm] = useState<{ op: "submit" | "review" | "approve"; label: string } | null>(null);

  const nameOf = (ref: string): string => {
    const r = rows.find((x) => rowKey(x) === ref || x.examResultId === ref || x.examCandidateId === ref);
    return r?.studentName ?? r?.studentNumber ?? ref;
  };

  async function fetchResultsPage(p: number): Promise<PortalListResult<Row> | null> {
    try {
      const res = await fetch(`/api/examinations/sessions/${sessionId}/results?page=${p}&pageSize=100`);
      if (!res.ok) return null;
      return (await res.json()) as PortalListResult<Row>;
    } catch {
      return null;
    }
  }

  async function reload(): Promise<void> {
    const dto = await fetchResultsPage(1);
    if (dto) {
      setRows(dto.items);
      setEdits(seedEdits(dto.items));
      setSelected(new Set());
      setPage(dto.page);
      setTotal(dto.total);
    }
  }

  function setEdit(key: string, patch: Partial<Edit>): void {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Dirty editable rows → bulk upsert payload.
  const dirty = rows.filter((r) => {
    if (!isEditable(r)) return false;
    const e = edits[rowKey(r)];
    if (!e) return false;
    return e.resultCode !== (r.resultCode ?? ExamResultCode.SCORED) || e.score !== (r.score != null ? String(r.score) : "") || e.maxScore !== (r.maxScore != null ? String(r.maxScore) : "");
  });

  const selectableRows = rows.filter((r) => r.examResultId);
  const allLoadedSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.examResultId as string));

  function applyRowErrors(data: BulkSummary): void {
    const errs: Record<string, string> = {};
    for (const it of data.results) {
      if (it.status !== "succeeded") errs[it.ref] = it.message ?? it.code ?? "Falhou";
    }
    setRowErrors(errs);
  }

  async function post(url: string, body: unknown, title: string): Promise<void> {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as BulkSummary & { error?: string };
      if (!res.ok) {
        toast({ title: "Ação recusada", description: json.error ?? "Não foi possível concluir.", variant: "destructive" });
        return;
      }
      applyRowErrors(json);
      setSummary({ title, data: json });
      await reload();
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function saveDrafts(): void {
    const payload = dirty.map((r) => {
      const e = edits[rowKey(r)];
      const scored = e.resultCode === ExamResultCode.SCORED;
      return {
        examCandidateId: r.examCandidateId,
        examResultId: r.examResultId ?? undefined,
        resultCode: e.resultCode,
        score: scored && e.score !== "" ? Number(e.score) : null,
        maxScore: e.maxScore !== "" ? Number(e.maxScore) : 0,
      };
    });
    void post(`/api/examinations/sessions/${sessionId}/results/bulk`, { items: payload }, "Rascunhos guardados");
  }

  function bulkLifecycle(op: "submit" | "review" | "approve", target: { examResultIds?: string[]; allMatching?: boolean }, title: string): void {
    void post(`/api/examinations/sessions/${sessionId}/results/bulk-${op}`, target, title);
  }

  async function loadMore(): Promise<void> {
    setLoadingMore(true);
    const dto = await fetchResultsPage(page + 1);
    if (dto) {
      setRows((prev) => {
        const seen = new Set(prev.map(rowKey));
        const fresh = dto.items.filter((r) => !seen.has(rowKey(r)));
        setEdits((e) => ({ ...e, ...seedEdits(fresh) }));
        return [...prev, ...fresh];
      });
      setPage(dto.page);
      setTotal(dto.total);
    }
    setLoadingMore(false);
  }

  const selCount = selected.size;
  const hasMore = rows.length < total;

  if (rows.length === 0) return <ExaminationEmptyState title="Sem resultados para esta sessão." />;

  return (
    <div className="space-y-3">
      {/* Bulk action bars */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-2">
        <Button size="sm" onClick={saveDrafts} disabled={busy || dirty.length === 0}>
          Guardar rascunhos{dirty.length > 0 ? ` (${dirty.length})` : ""}
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Selecionados:</span>
        <Button size="sm" variant="secondary" disabled={busy || selCount === 0} onClick={() => bulkLifecycle("submit", { examResultIds: [...selected] }, "Resultados submetidos")}>
          Submeter{selCount ? ` (${selCount})` : ""}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy || selCount === 0} onClick={() => bulkLifecycle("review", { examResultIds: [...selected] }, "Resultados revistos")}>
          Rever{selCount ? ` (${selCount})` : ""}
        </Button>
        <Button size="sm" disabled={busy || selCount === 0} onClick={() => bulkLifecycle("approve", { examResultIds: [...selected] }, "Resultados aprovados")}>
          Aprovar{selCount ? ` (${selCount})` : ""}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Toda a sessão:</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ op: "submit", label: "submeter todos os rascunhos da sessão" })}>Submeter rascunhos</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ op: "review", label: "rever todos os submetidos da sessão" })}>Rever submetidos</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ op: "approve", label: "aprovar todos os revistos da sessão" })}>Aprovar revistos</Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos os visíveis"
                  checked={allLoadedSelected}
                  onChange={(e) => {
                    setSelected(() => {
                      if (!e.target.checked) return new Set();
                      return new Set(selectableRows.map((r) => r.examResultId as string));
                    });
                  }}
                />
              </th>
              <th className="px-3 py-2 font-medium">Aluno</th>
              <th className="px-3 py-2 font-medium">Presença</th>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Nota</th>
              <th className="px-3 py-2 font-medium">Nota máx.</th>
              <th className="px-3 py-2 font-medium">% exame</th>
              <th className="px-3 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = rowKey(r);
              const editable = isEditable(r);
              const e = edits[key];
              const scored = editable ? e?.resultCode === ExamResultCode.SCORED : r.resultCode === ExamResultCode.SCORED;
              const err = rowErrors[key] ?? (r.examResultId ? rowErrors[r.examResultId] : undefined);
              return (
                <tr key={key} className="border-b last:border-0 align-top">
                  <td className="px-2 py-2">
                    {r.examResultId ? (
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${r.studentName ?? key}`}
                        checked={selected.has(r.examResultId)}
                        onChange={() => toggle(r.examResultId as string)}
                      />
                    ) : (
                      <span className="text-muted-foreground" title="Sem resultado ainda">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.studentName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.studentNumber ?? r.examCandidateId}</div>
                    {err && <div className="mt-1 text-xs text-destructive">{err}</div>}
                  </td>
                  <td className="px-3 py-2">{r.attendanceStatus ? <ExaminationStatusBadge kind="attendance" status={r.attendanceStatus} /> : "—"}</td>
                  <td className="px-3 py-2">
                    {editable && e ? (
                      <Select value={e.resultCode} onValueChange={(v) => setEdit(key, { resultCode: v })}>
                        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.values(ExamResultCode).map((c) => (
                            <SelectItem key={c} value={c}>{RESULT_CODE_LABELS[c]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      RESULT_CODE_LABELS[r.resultCode ?? ""] ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable && e ? (
                      <Input
                        type="number"
                        className={cn("h-8 w-20", !scored && "invisible")}
                        value={scored ? e.score : ""}
                        onChange={(ev) => setEdit(key, { score: ev.target.value })}
                        aria-label="Nota"
                      />
                    ) : scored && r.score != null ? (
                      r.score
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editable && e ? (
                      <Input type="number" className="h-8 w-20" value={e.maxScore} onChange={(ev) => setEdit(key, { maxScore: ev.target.value })} aria-label="Nota máxima" />
                    ) : (
                      r.maxScore ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.normalizedScore != null ? `${r.normalizedScore}%` : "—"}</td>
                  <td className="px-3 py-2">{r.resultStatus ? <ResultStatusBadge status={r.resultStatus} /> : "Sem resultado"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>A mostrar {rows.length} de {total} resultados.</span>
        {hasMore && (
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "A carregar…" : "Carregar mais"}
          </Button>
        )}
      </div>

      {/* Whole-session confirm */}
      <Dialog open={confirm !== null} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar ação sobre toda a sessão</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Isto vai <strong>{confirm?.label}</strong>, não apenas os visíveis. Itens noutro estado são ignorados. Continuar?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!confirm) return;
                const titles = { submit: "Rascunhos submetidos", review: "Submetidos revistos", approve: "Revistos aprovados" };
                const op = confirm.op;
                setConfirm(null);
                bulkLifecycle(op, { allMatching: true }, titles[op]);
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkSummaryDialog
        open={summary !== null}
        onOpenChange={(o) => { if (!o) setSummary(null); }}
        title={summary?.title ?? "Resumo"}
        summary={summary?.data ?? null}
        nameOf={nameOf}
      />
    </div>
  );
}
