"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { toast } from "@/shared/hooks/use-toast";
import type { ExamRegisterablePanelDto, ExamRegisterableStudentDto } from "@/modules/examinations/types/portal";
import type { BulkSummary } from "@/modules/examinations/lib/bulk-runner";
import { BulkSummaryDialog } from "./bulk-summary-dialog";

// =============================================================================
// BulkRegisterDialog (Sprint 2.1 P3) — register many candidates at once.
// Pick from the course roster, see a pre-flight preview (eligible / already / no
// vacancy) BEFORE committing, then a grouped succeeded/ignored/failed summary.
// One HTTP call → runBulk over the existing Register command per item.
// =============================================================================

export function BulkRegisterDialog({ sessionId, levelSubjectId }: { sessionId: string; levelSubjectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<ExamRegisterablePanelDto | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState<BulkSummary | null>(null);

  async function openDialog(): Promise<void> {
    setOpen(true);
    setLoading(true);
    setSelected(new Set());
    setQuery("");
    try {
      const res = await fetch(`/api/examinations/sessions/${sessionId}/candidates/registerable`);
      setPanel(res.ok ? ((await res.json()) as ExamRegisterablePanelDto) : null);
    } catch {
      setPanel(null);
    } finally {
      setLoading(false);
    }
  }

  const items = panel?.items ?? [];
  const filtered = query.trim()
    ? items.filter((i) => `${i.name} ${i.number ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnregistered(): void {
    setSelected(new Set(filtered.filter((i) => !i.alreadyRegistered).map((i) => i.studentId)));
  }

  // Pre-flight preview (known facts only; academic eligibility is confirmed on submit).
  const selectedItems: ExamRegisterableStudentDto[] = items.filter((i) => selected.has(i.studentId));
  const already = selectedItems.filter((i) => i.alreadyRegistered).length;
  const toRegister = selectedItems.length - already;
  const remaining = panel ? Math.max(0, panel.capacity - panel.registeredCount) : 0;
  const noVacancy = Math.max(0, toRegister - remaining);
  const eligibleEstimate = toRegister - noVacancy;

  async function submit(): Promise<void> {
    setBusy(true);
    try {
      const payload = selectedItems.map((i) => ({ studentId: i.studentId, enrollmentId: i.enrollmentId, levelSubjectId }));
      const res = await fetch(`/api/examinations/sessions/${sessionId}/candidates/bulk-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const json = (await res.json().catch(() => ({}))) as BulkSummary & { error?: string };
      if (!res.ok) {
        toast({ title: "Ação recusada", description: json.error ?? "Não foi possível inscrever.", variant: "destructive" });
        return;
      }
      setOpen(false);
      setSummary(json);
      router.refresh();
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (ref: string): string => items.find((i) => i.studentId === ref)?.name ?? ref;

  return (
    <>
      <Button size="sm" variant="secondary" onClick={openDialog}>Inscrever em massa</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Inscrição em massa</DialogTitle></DialogHeader>

          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">A carregar alunos…</p>
          ) : !panel || items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum aluno elegível para inscrição neste curso.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar aluno…" className="flex-1" />
                <Button variant="outline" size="sm" onClick={selectAllUnregistered}>Selecionar não inscritos</Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
              </div>

              <div className="max-h-64 overflow-y-auto rounded-md border">
                {filtered.map((i) => (
                  <label key={i.studentId} className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/40">
                    <input type="checkbox" checked={selected.has(i.studentId)} onChange={() => toggle(i.studentId)} />
                    <span className="flex-1">
                      <span className="font-medium">{i.name}</span>
                      {i.number && <span className="ml-2 text-xs text-muted-foreground">Nº {i.number}</span>}
                    </span>
                    {i.alreadyRegistered && <Badge variant="secondary">Inscrito</Badge>}
                  </label>
                ))}
              </div>

              {/* Pre-flight preview */}
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <p className="font-medium">{selectedItems.length} inscrições selecionadas</p>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-muted-foreground sm:grid-cols-4">
                  <span className="flex justify-between gap-2"><span>Elegíveis*</span><span className="tabular-nums text-foreground">{eligibleEstimate}</span></span>
                  <span className="flex justify-between gap-2"><span>Já inscritos</span><span className="tabular-nums text-foreground">{already}</span></span>
                  <span className="flex justify-between gap-2"><span>Sem vaga</span><span className="tabular-nums text-foreground">{noVacancy}</span></span>
                  <span className="flex justify-between gap-2"><span>Vagas</span><span className="tabular-nums text-foreground">{remaining}</span></span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">*Estimativa — a elegibilidade académica é confirmada no momento da inscrição.</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
            <Button onClick={submit} disabled={busy || selectedItems.length === 0}>
              Inscrever {selectedItems.length > 0 ? `(${selectedItems.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkSummaryDialog
        open={summary !== null}
        onOpenChange={(o) => { if (!o) setSummary(null); }}
        title="Inscrição em massa"
        summary={summary}
        successNoun="inscritos"
        nameOf={nameOf}
      />
    </>
  );
}
