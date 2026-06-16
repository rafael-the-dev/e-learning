"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { useToast } from "@/shared/hooks/use-toast";

interface ResolveIntegrityIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueId: string;
  checkName: string;
  onResolved: () => void;
}

type NewStatus = "RESOLVED" | "ACKNOWLEDGED" | "SUPPRESSED";

export function ResolveIntegrityIssueDialog({
  open,
  onOpenChange,
  issueId,
  checkName,
  onResolved,
}: ResolveIntegrityIssueDialogProps) {
  const { toast } = useToast();
  const [newStatus, setNewStatus] = React.useState<NewStatus>("ACKNOWLEDGED");
  const [resolutionNotes, setResolutionNotes] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newStatus === "RESOLVED" && !resolutionNotes.trim()) {
      setError("Notas de resolução são obrigatórias ao resolver um problema.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/reports/finance/integrity/${issueId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, resolutionNotes: resolutionNotes.trim() || undefined }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erro ao actualizar problema");
      }

      toast({ title: "Problema actualizado com sucesso" });
      onResolved();
      onOpenChange(false);
      setResolutionNotes("");
      setNewStatus("ACKNOWLEDGED");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao actualizar problema";
      setError(message);
      toast({ title: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Actualizar Problema de Integridade</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-mono break-all">{checkName}</p>
          </div>

          <div className="space-y-2">
            <Label>Novo Estado</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as NewStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACKNOWLEDGED">Reconhecido — em investigação</SelectItem>
                <SelectItem value="RESOLVED">Resolvido — corrigido manualmente</SelectItem>
                <SelectItem value="SUPPRESSED">Suprimido — falso positivo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Notas {newStatus === "RESOLVED" && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              placeholder="Descreva a acção tomada ou o motivo..."
              rows={3}
              maxLength={2000}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
