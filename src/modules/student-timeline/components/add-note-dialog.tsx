"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Alert } from "@/shared/components/ui/alert";
import { StickyNote } from "lucide-react";
import { createManualNoteAction } from "@/modules/student-timeline/actions/student-timeline.actions";

export function AddNoteDialog({
  studentId,
  open,
  onOpenChange,
}: {
  studentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function reset() {
    setTitle("");
    setDescription("");
    setOccurredAt(new Date().toISOString().slice(0, 16));
    setError(null);
    setFieldErrors({});
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const result = await createManualNoteAction({
      studentId,
      title,
      description: description || undefined,
      occurredAt,
    });

    setSubmitting(false);

    if (!result.success) {
      setError(result.error ?? "Erro ao criar nota");
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      return;
    }

    reset();
    onOpenChange(false);
    router.refresh();
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <StickyNote className="size-4 text-muted-foreground" />
            <DialogTitle>Adicionar Nota</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <p className="text-sm">{error}</p>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="note-title">Título</Label>
            <Input
              id="note-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Aluno solicitou mudança de turma"
              required
            />
            {fieldErrors.title?.map((msg) => (
              <p key={msg} className="text-xs text-destructive">{msg}</p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-description">Descrição <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              id="note-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes adicionais…"
              rows={3}
            />
            {fieldErrors.description?.map((msg) => (
              <p key={msg} className="text-xs text-destructive">{msg}</p>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note-date">Data e hora</Label>
            <Input
              id="note-date"
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              required
            />
            {fieldErrors.occurredAt?.map((msg) => (
              <p key={msg} className="text-xs text-destructive">{msg}</p>
            ))}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? "A guardar…" : "Guardar Nota"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
