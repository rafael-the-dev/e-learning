"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
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
import type { ExamAppealDetailDto } from "@/modules/examinations/types/portal";
import { AllowedActionButton } from "./allowed-action-button";

// Approving an appeal creates an append-only REVISION with a revised score — it never
// overwrites the published result. The command is authoritative; this dialog only
// collects the revised score + mandatory reason. Reject/review are plain allowedActions.
function ApproveDialog({ appealId }: { appealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revisedScore, setRevisedScore] = useState("");
  const [reason, setReason] = useState("");

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`/api/examinations/appeals/${appealId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisedScore: Number(revisedScore), reason }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível aprovar o recurso.", variant: "destructive" });
        return;
      }
      toast({ title: "Recurso aprovado", description: "Criada uma revisão com a nota revista." });
      setOpen(false);
      router.refresh();
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>Aprovar com nota revista</Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar recurso</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
            A aprovação cria uma revisão append-only. O resultado publicado original é preservado.
          </p>
          <div className="space-y-1">
            <Label htmlFor="ap-score">Nota revista</Label>
            <Input id="ap-score" type="number" value={revisedScore} onChange={(e) => setRevisedScore(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ap-reason">Motivo da decisão</Label>
            <Textarea id="ap-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || revisedScore === "" || reason.trim().length === 0}>Aprovar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AppealDecisionPanel({ appeal }: { appeal: ExamAppealDetailDto }) {
  const a = appeal.allowedActions;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Decisão</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <AllowedActionButton allowed={a.canReview} url={`/api/examinations/appeals/${appeal.appealId}/review`} label="Colocar em análise" variant="secondary" hideWhenDisallowed successMessage="Recurso em análise" />
          {a.canApprove && <ApproveDialog appealId={appeal.appealId} />}
          <AllowedActionButton allowed={a.canReject} url={`/api/examinations/appeals/${appeal.appealId}/reject`} label="Rejeitar" variant="destructive" hideWhenDisallowed reasonRequired reasonLabel="Motivo da rejeição" confirmTitle="Rejeitar recurso" successMessage="Recurso rejeitado" />
        </div>
      </CardContent>
    </Card>
  );
}
