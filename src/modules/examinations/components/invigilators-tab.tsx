"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "@/shared/hooks/use-toast";
import { ExamInvigilatorRole } from "@/modules/examinations/constants";
import type { ExamInvigilatorDto, ExamInvigilatorPanelDto } from "@/modules/examinations/types/portal";
import { ExaminationEmptyState } from "./examination-states";

// =============================================================================
// InvigilatorsTab (Increment 4) — list + assign (APPEND-ONLY in v1, no unassign)
// -----------------------------------------------------------------------------
// Lists a session's invigilators (name + role) and, when allowedActions permit,
// assigns a teacher in a role via the existing command. Duplicate + time-conflict
// are enforced by the command and surfaced as typed errors. Assignment optimistically
// appends on success (no reload). There is deliberately NO remove — unassignment is a
// future domain decision (ExamInvigilatorAssignment is append-only).
// =============================================================================

const ROLE_LABELS: Record<string, string> = {
  CHIEF: "Chefe de vigilância",
  INVIGILATOR: "Vigilante",
  MARKER: "Corretor",
  OBSERVER: "Observador",
};

export function InvigilatorsTab({ sessionId, panel }: { sessionId: string; panel: ExamInvigilatorPanelDto }) {
  const [items, setItems] = useState<ExamInvigilatorDto[]>(panel.items);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [role, setRole] = useState<string>(ExamInvigilatorRole.INVIGILATOR);

  async function assign(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`/api/examinations/sessions/${sessionId}/invigilators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId, role }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; assignmentId?: string };
      if (!res.ok || !json.assignmentId) {
        toast({ title: "Ação recusada", description: json.error ?? "Não foi possível atribuir.", variant: "destructive" });
        return;
      }
      const teacher = panel.assignableTeachers.find((t) => t.teacherId === teacherId);
      setItems((prev) => [
        ...prev,
        { assignmentId: json.assignmentId!, examSessionId: sessionId, teacherId, userId: null, role, name: teacher?.name ?? teacherId },
      ]);
      toast({ title: "Vigilante atribuído" });
      setOpen(false);
      setTeacherId("");
      setRole(ExamInvigilatorRole.INVIGILATOR);
    } catch {
      toast({ title: "Erro de rede", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // Teachers not yet assigned to this session (avoid obvious duplicates in the picker).
  const assignedTeacherIds = new Set(items.map((i) => i.teacherId).filter(Boolean));
  const available = panel.assignableTeachers.filter((t) => !assignedTeacherIds.has(t.teacherId));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Atribuições são permanentes nesta versão — a remoção será uma decisão futura.
        </p>
        {panel.canAssign && (
          <Button size="sm" onClick={() => setOpen(true)} disabled={available.length === 0}>
            Atribuir vigilante
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <ExaminationEmptyState
          title="Sem vigilantes atribuídos"
          description={panel.canAssign ? "Atribua um formador a esta sessão." : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Função</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.assignmentId} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{i.name}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary">{ROLE_LABELS[i.role] ?? i.role}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir vigilante</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Formador</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger><SelectValue placeholder="Selecionar formador…" /></SelectTrigger>
                <SelectContent>
                  {available.map((t) => (
                    <SelectItem key={t.teacherId} value={t.teacherId}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Função</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(ExamInvigilatorRole).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r] ?? r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={assign} disabled={loading || !teacherId}>Atribuir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
