"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { toast } from "@/shared/hooks/use-toast";
import type { ExamCandidateListItemDto, PortalListResult } from "@/modules/examinations/types/portal";
import { CandidateStatusBadge, ExaminationStatusBadge } from "./status-badges";
import { ExaminationEmptyState } from "./examination-states";
import { AllowedActionButton } from "./allowed-action-button";
import { StudentLookup, EnrollmentLookup } from "./entity-lookups";
import { BulkRegisterDialog } from "./bulk-register-dialog";

// Register / register-with-override. Override records the acting user + reason and NEVER
// hides that the candidate was originally ineligible (the eligibility verdict is stored
// server-side; the detail view shows the provenance). Student/enrollment ids are entered
// directly here (picker is a future enhancement).
function RegisterDialog({ sessionId, levelSubjectId, override, onDone }: { sessionId: string; levelSubjectId: string; override: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [studentLabel, setStudentLabel] = useState<string | null>(null);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [enrollmentLabel, setEnrollmentLabel] = useState<string | null>(null);
  const [assignedSeat, setAssignedSeat] = useState("");
  const [reason, setReason] = useState("");

  function reset(): void {
    setStudentId("");
    setStudentLabel(null);
    setEnrollmentId("");
    setEnrollmentLabel(null);
    setAssignedSeat("");
    setReason("");
  }

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const url = `/api/examinations/sessions/${sessionId}/candidates/${override ? "override" : "register"}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, enrollmentId, levelSubjectId, assignedSeat: assignedSeat || undefined, reason: reason || undefined }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível inscrever.", variant: "destructive" });
        return;
      }
      toast({ title: override ? "Candidato inscrito (override)" : "Candidato inscrito" });
      reset();
      setOpen(false);
      if (onDone) onDone();
      else router.refresh();
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={override ? "secondary" : "default"} size="sm" onClick={() => setOpen(true)}>
        {override ? "Inscrever com override" : "Inscrever candidato"}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{override ? "Inscrição com override de elegibilidade" : "Inscrever candidato"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {override && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              O override ignora apenas a elegibilidade académica. O veredito real é preservado e auditado.
            </p>
          )}
          <div className="space-y-1">
            <Label>Aluno</Label>
            <StudentLookup
              value={studentId || null}
              selectedLabel={studentLabel}
              onChange={(v, item) => {
                setStudentId(v ?? "");
                setStudentLabel(item?.label ?? null);
                setEnrollmentId("");
                setEnrollmentLabel(null);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label>Matrícula</Label>
            <EnrollmentLookup
              studentId={studentId || null}
              value={enrollmentId || null}
              selectedLabel={enrollmentLabel}
              onChange={(v, item) => {
                setEnrollmentId(v ?? "");
                setEnrollmentLabel(item?.label ?? null);
              }}
            />
          </div>
          <div className="space-y-1"><Label htmlFor="c-seat">Lugar (opcional)</Label><Input id="c-seat" value={assignedSeat} onChange={(e) => setAssignedSeat(e.target.value)} /></div>
          {override && (
            <div className="space-y-1"><Label htmlFor="c-reason">Motivo do override</Label><Textarea id="c-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !studentId || !enrollmentId || (override && !reason)}>Inscrever</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CandidatesTab({
  sessionId,
  levelSubjectId,
  items,
  total: initialTotal,
}: {
  sessionId: string;
  levelSubjectId: string;
  items: ExamCandidateListItemDto[];
  page: number;
  pageSize: number;
  total: number;
}) {
  const [rows, setRows] = useState<ExamCandidateListItemDto[]>(items);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchPage(p: number, q: string): Promise<PortalListResult<ExamCandidateListItemDto> | null> {
    const params = new URLSearchParams({ page: String(p), pageSize: "100" });
    if (q.trim()) params.set("search", q.trim());
    try {
      const res = await fetch(`/api/examinations/sessions/${sessionId}/candidates?${params}`);
      return res.ok ? ((await res.json()) as PortalListResult<ExamCandidateListItemDto>) : null;
    } catch {
      return null;
    }
  }

  async function reload(q: string = search): Promise<void> {
    setLoading(true);
    const dto = await fetchPage(1, q);
    if (dto) {
      setRows(dto.items);
      setTotal(dto.total);
      setPage(1);
    }
    setLoading(false);
  }

  // Refetch on tab-enter (fresh after registrations made elsewhere).
  useEffect(() => {
    void (async () => {
      await reload("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearchChange(v: string): void {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void reload(v), 300);
  }

  async function loadMore(): Promise<void> {
    setLoadingMore(true);
    const dto = await fetchPage(page + 1, search);
    if (dto) {
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.examCandidateId));
        return [...prev, ...dto.items.filter((r) => !seen.has(r.examCandidateId))];
      });
      setPage((p) => p + 1);
      setTotal(dto.total);
    }
    setLoadingMore(false);
  }

  const hasMore = rows.length < total;
  const searching = search.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-55 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar por nome, nº de aluno ou matrícula…"
            className="pl-8"
            aria-label="Pesquisar candidatos"
          />
        </div>
        <div className="flex gap-2">
          <BulkRegisterDialog sessionId={sessionId} levelSubjectId={levelSubjectId} onDone={() => void reload()} />
          <RegisterDialog sessionId={sessionId} levelSubjectId={levelSubjectId} override={false} onDone={() => void reload()} />
          <RegisterDialog sessionId={sessionId} levelSubjectId={levelSubjectId} override onDone={() => void reload()} />
        </div>
      </div>

      {rows.length === 0 ? (
        searching ? (
          <ExaminationEmptyState
            title={`Sem candidatos para «${search.trim()}»`}
            description="Nenhum candidato corresponde à pesquisa."
            action={<Button variant="outline" size="sm" onClick={() => { setSearch(""); void reload(""); }}>Limpar pesquisa</Button>}
          />
        ) : (
          <ExaminationEmptyState title="Sem candidatos inscritos." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Aluno</th>
                  <th className="px-3 py-2 font-medium">Tentativa</th>
                  <th className="px-3 py-2 font-medium">Elegibilidade</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Lugar</th>
                  <th className="px-3 py-2 font-medium">Assiduidade</th>
                  <th className="px-3 py-2 font-medium">Resultado</th>
                  <th className="px-3 py-2 font-medium">Override</th>
                  <th className="px-3 py-2 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.examCandidateId} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.studentName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.studentNumber ?? c.studentId}</div>
                    </td>
                    <td className="px-3 py-2">{c.attemptNumber ?? "—"}</td>
                    <td className="px-3 py-2"><ExaminationStatusBadge kind="candidate" status={c.eligibilityStatus} /></td>
                    <td className="px-3 py-2"><CandidateStatusBadge status={c.candidateStatus} /></td>
                    <td className="px-3 py-2">{c.assignedSeat ?? "—"}</td>
                    <td className="px-3 py-2">{c.attendanceStatus ? <ExaminationStatusBadge kind="attendance" status={c.attendanceStatus} /> : "—"}</td>
                    <td className="px-3 py-2">{c.resultStatus ? <ExaminationStatusBadge kind="result" status={c.resultStatus} /> : "—"}</td>
                    <td className="px-3 py-2">{c.overridden ? "Sim" : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <AllowedActionButton allowed={c.allowedActions.canWithdraw} url={`/api/examinations/candidates/${c.examCandidateId}/withdraw`} label="Retirar" variant="outline" hideWhenDisallowed reasonRequired reasonLabel="Motivo" confirmTitle="Retirar candidato" successMessage="Candidato retirado" onSuccess={() => reload()} />
                        <AllowedActionButton allowed={c.allowedActions.canDisqualify} url={`/api/examinations/candidates/${c.examCandidateId}/disqualify`} label="Desqualificar" variant="destructive" hideWhenDisallowed reasonRequired reasonLabel="Motivo da desqualificação" confirmTitle="Desqualificar candidato" successMessage="Candidato desqualificado" onSuccess={() => reload()} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{loading ? "A pesquisar…" : `A mostrar ${rows.length} de ${total} candidatos.`}</span>
            {hasMore && (
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "A carregar…" : "Carregar mais"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
