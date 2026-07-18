"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { toast } from "@/shared/hooks/use-toast";

// Appeal-create form. The domain owns a SINGLE free-text field (the student's
// motive) — no category/description. Posts to the already-implemented API and
// refreshes the server tree on success so the result detail re-renders with the
// new appeal summary.

export function AppealCreateForm({ examResultId }: { examResultId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const trimmed = reason.trim();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed || loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/student/examinations/results/${examResultId}/appeals`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: trimmed }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Não foi possível submeter o recurso",
          description: data.error ?? "Tente novamente.",
        });
        return;
      }
      toast({ variant: "success", title: "Recurso submetido" });
      setReason("");
      router.refresh();
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível submeter o recurso",
        description: "Verifique a ligação e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="appeal-reason">Motivo do recurso</Label>
        <Textarea
          id="appeal-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Descreve o motivo pelo qual pretendes recorrer deste resultado."
          rows={5}
          required
          disabled={loading}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={loading} disabled={!trimmed || loading}>
          Submeter recurso
        </Button>
      </div>
    </form>
  );
}
