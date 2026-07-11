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
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { toast } from "@/shared/hooks/use-toast";
import type { ExamRoomDetailDto, ExamRoomListItemDto } from "@/modules/examinations/types/portal";

// Create / edit an exam room. Submits to the thin API route; the command validates
// and is authoritative — any rejection is surfaced as the command's typed error.
export function RoomFormDialog({
  mode,
  room,
  trigger,
}: {
  mode: "create" | "edit";
  room?: ExamRoomListItemDto | ExamRoomDetailDto;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(room?.name ?? "");
  const [code, setCode] = useState(room?.code ?? "");
  const [capacity, setCapacity] = useState(room?.capacity != null ? String(room.capacity) : "");
  const [description, setDescription] = useState(room?.description ?? "");

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const url = mode === "create" ? "/api/examinations/rooms" : `/api/examinations/rooms/${room?.roomId}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: code || undefined,
          capacity: capacity ? Number(capacity) : undefined,
          description: description || undefined,
        }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível guardar.", variant: "destructive" });
        return;
      }
      toast({ title: mode === "create" ? "Sala criada" : "Sala atualizada" });
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nova sala" : "Editar sala"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="room-name">Nome</Label>
            <Input id="room-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="room-code">Código</Label>
              <Input id="room-code" value={code ?? ""} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="room-capacity">Capacidade</Label>
              <Input id="room-capacity" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="room-desc">Descrição</Label>
            <Textarea id="room-desc" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || name.trim().length === 0}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
