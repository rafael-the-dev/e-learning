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

// Create a DRAFT exam period. The command validates the window + academic year; this form
// only collects the fields and surfaces the command's typed error.
export function PeriodFormDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [term, setTerm] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function submit(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/examinations/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          academicYear,
          term: term || undefined,
          startsAt: startsAt ? new Date(startsAt).toISOString() : "",
          endsAt: endsAt ? new Date(endsAt).toISOString() : "",
        }),
      });
      if (!res.ok) {
        const p = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "Ação recusada", description: p.error ?? "Não foi possível criar o período.", variant: "destructive" });
        return;
      }
      toast({ title: "Período criado" });
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
          <DialogTitle>Novo período de exame</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="p-name">Nome</Label><Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="p-year">Ano letivo</Label><Input id="p-year" value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} placeholder="2025/2026" /></div>
            <div className="space-y-1"><Label htmlFor="p-term">Período (opcional)</Label><Input id="p-term" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="p-start">Início</Label><Input id="p-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="p-end">Fim</Label><Input id="p-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={submit} disabled={loading || !name || !academicYear || !startsAt || !endsAt}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
