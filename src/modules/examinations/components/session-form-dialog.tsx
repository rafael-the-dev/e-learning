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
import { PeriodLookup, LevelSubjectLookup, RoomLookup } from "./entity-lookups";

// Create a DRAFT exam session. Period / level-subject / room are chosen with searchable
// pickers. The command validates the window, capacity and references.
export function SessionFormDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [periodId, setPeriodId] = useState("");
  const [periodLabel, setPeriodLabel] = useState<string | null>(null);
  const [levelSubjectId, setLevelSubjectId] = useState("");
  const [levelSubjectLabel, setLevelSubjectLabel] = useState<string | null>(null);
  const [roomId, setRoomId] = useState("");
  const [roomLabel, setRoomLabel] = useState<string | null>(null);
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
          <div className="space-y-1">
            <Label>Período</Label>
            <PeriodLookup value={periodId || null} selectedLabel={periodLabel} onChange={(v, item) => { setPeriodId(v ?? ""); setPeriodLabel(item?.label ?? null); }} />
          </div>
          <div className="space-y-1">
            <Label>Disciplina do nível</Label>
            <LevelSubjectLookup value={levelSubjectId || null} selectedLabel={levelSubjectLabel} onChange={(v, item) => { setLevelSubjectId(v ?? ""); setLevelSubjectLabel(item?.label ?? null); }} />
          </div>
          <div className="space-y-1"><Label htmlFor="s-title">Título (opcional)</Label><Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Sala (opcional)</Label>
            <RoomLookup value={roomId || null} selectedLabel={roomLabel} onChange={(v, item) => { setRoomId(v ?? ""); setRoomLabel(item?.label ?? null); }} />
          </div>
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
