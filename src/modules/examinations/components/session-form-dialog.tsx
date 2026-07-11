"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { toast } from "@/shared/hooks/use-toast";

// Create a DRAFT exam session. Period / level-subject / room are referenced by id (pickers
// are a future enhancement). The command validates the window, capacity and references.
export function SessionFormDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [periodId, setPeriodId] = useState("");
  const [levelSubjectId, setLevelSubjectId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [capacity, setCapacity] = useState("");

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/examinations/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          levelSubjectId,
          roomId: roomId || undefined,
          title: title || undefined,
          startsAt: startsAt ? new Date(startsAt).toISOString() : "",
          endsAt: endsAt ? new Date(endsAt).toISOString() : "",
          capacity: capacity !== "" ? Number(capacity) : undefined,
        }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível criar a sessão.", variant: "destructive" });
        return;
      }
      toast({ title: "Sessão criada" });
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
      <div onClick={() => setOpen(true)}>{trigger}</div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova sessão de exame</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="s-period">ID do período</Label><Input id="s-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="s-ls">ID da disciplina do nível</Label><Input id="s-ls" value={levelSubjectId} onChange={(e) => setLevelSubjectId(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="s-title">Título (opcional)</Label><Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="s-room">ID da sala (opcional)</Label><Input id="s-room" value={roomId} onChange={(e) => setRoomId(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="s-start">Início</Label><Input id="s-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="s-end">Fim</Label><Input id="s-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="s-cap">Capacidade</Label><Input id="s-cap" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !periodId || !levelSubjectId || !startsAt || !endsAt || capacity === ""}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
