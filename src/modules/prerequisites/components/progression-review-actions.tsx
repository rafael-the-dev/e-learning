"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  approveProgressionRequestAction,
  rejectProgressionRequestAction,
} from "@/modules/prerequisites/actions/prerequisite.actions";

type Mode = "approve" | "reject" | null;

interface Props {
  requestId: string;
  canApprove: boolean;
  canReject: boolean;
}

export function ProgressionReviewActions({ requestId, canApprove, canReject }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  if (!canApprove && !canReject) return null;

  function close() {
    if (loading) return;
    setMode(null);
    setText("");
  }

  async function submit() {
    setLoading(true);
    const result =
      mode === "approve"
        ? await approveProgressionRequestAction({ requestId, reviewNotes: text.trim() || null })
        : await rejectProgressionRequestAction({ requestId, reason: text.trim() });
    setLoading(false);

    if (result.success) {
      toast.success(mode === "approve" ? "Progressão aprovada" : "Pedido rejeitado");
      setMode(null);
      setText("");
      router.refresh();
      router.push("/academic/progression-requests");
    } else {
      toast.error(result.error);
    }
  }

  const rejectInvalid = mode === "reject" && text.trim().length < 5;

  return (
    <>
      <div className="flex items-center gap-2">
        {canApprove && (
          <Button size="sm" onClick={() => setMode("approve")}>
            <CheckCircle2 className="size-4 mr-1.5" />
            Aprovar
          </Button>
        )}
        {canReject && (
          <Button size="sm" variant="destructive" onClick={() => setMode("reject")}>
            <XCircle className="size-4 mr-1.5" />
            Rejeitar
          </Button>
        )}
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "approve" ? "Aprovar Progressão" : "Rejeitar Pedido"}
            </DialogTitle>
            <DialogDescription>
              {mode === "approve"
                ? "O aluno será promovido ao nível seguinte. Pode adicionar notas (opcional)."
                : "O pedido será rejeitado e o nível do aluno permanece inalterado. O motivo é obrigatório."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="review-text">
              {mode === "approve" ? "Notas (opcional)" : "Motivo da rejeição"}
            </Label>
            <Textarea
              id="review-text"
              rows={4}
              placeholder={
                mode === "approve" ? "Notas da aprovação..." : "Indique o motivo da rejeição..."
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant={mode === "reject" ? "destructive" : "default"}
              onClick={submit}
              disabled={loading || rejectInvalid}
              loading={loading}
            >
              {mode === "approve" ? "Confirmar Aprovação" : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
