"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";

// Withdraw an appeal. Opens a destructive ConfirmDialog and posts to the
// already-implemented withdraw endpoint, then refreshes the server tree.

export function WithdrawAppealButton({ appealId }: { appealId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/student/examinations/appeals/${appealId}/withdraw`,
        { method: "POST" }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Não foi possível retirar o recurso",
          description: data.error ?? "Tente novamente.",
        });
        return;
      }
      toast({ variant: "success", title: "Recurso retirado" });
      setOpen(false);
      router.refresh();
    } catch {
      toast({
        variant: "destructive",
        title: "Não foi possível retirar o recurso",
        description: "Verifique a ligação e tente novamente.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Retirar recurso
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Retirar recurso?"
        description="O recurso deixará de ser analisado. Confirma que pretende retirá-lo?"
        cancelLabel="Cancelar"
        confirmLabel="Retirar recurso"
        variant="destructive"
        loading={loading}
        onConfirm={onConfirm}
      />
    </>
  );
}
