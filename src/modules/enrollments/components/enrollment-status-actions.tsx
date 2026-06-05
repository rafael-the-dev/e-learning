"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import {
  activateEnrollmentAction,
  suspendEnrollmentAction,
  cancelEnrollmentAction,
  completeEnrollmentAction,
} from "@/modules/enrollments/actions/enrollment.actions";
import { toast } from "@/shared/hooks/use-toast";
import { CheckCircle, PauseCircle, XCircle, BadgeCheck } from "lucide-react";
import { ENROLLMENT_TRANSITIONS } from "@/modules/enrollments/types";
import type { Enrollment } from "@/modules/enrollments/types";

interface StatusActionsProps {
  enrollment: Enrollment;
  canActivate: boolean;
  canSuspend: boolean;
  canCancel: boolean;
  canComplete: boolean;
}

export function EnrollmentStatusActions({
  enrollment,
  canActivate,
  canSuspend,
  canCancel,
  canComplete,
}: StatusActionsProps) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<"suspend" | "cancel" | "complete" | "activate" | null>(null);
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const transitions = ENROLLMENT_TRANSITIONS[enrollment.status] ?? [];

  async function handleAction() {
    setLoading(true);
    let result;

    if (dialog === "activate") {
      result = await activateEnrollmentAction(enrollment.id, reason || undefined);
    } else if (dialog === "suspend") {
      result = await suspendEnrollmentAction(enrollment.id, reason);
    } else if (dialog === "cancel") {
      result = await cancelEnrollmentAction(enrollment.id, reason);
    } else if (dialog === "complete") {
      result = await completeEnrollmentAction(enrollment.id, reason || undefined);
    } else {
      setLoading(false);
      return;
    }

    setLoading(false);
    if (result.success) {
      const messages: Record<string, string> = {
        activate: "Matrícula ativada com sucesso",
        suspend: "Matrícula suspensa com sucesso",
        cancel: "Matrícula cancelada com sucesso",
        complete: "Matrícula concluída com sucesso",
      };
      toast.success(messages[dialog!] ?? "Operação realizada com sucesso");
      setDialog(null);
      setReason("");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const dialogConfig = {
    activate: {
      title: "Ativar Matrícula",
      description: "Confirme a ativação desta matrícula.",
      reasonLabel: "Motivo (opcional)",
      required: false,
      confirmLabel: "Ativar",
      variant: "default" as const,
    },
    suspend: {
      title: "Suspender Matrícula",
      description: "Indique o motivo da suspensão.",
      reasonLabel: "Motivo *",
      required: true,
      confirmLabel: "Suspender",
      variant: "destructive" as const,
    },
    cancel: {
      title: "Cancelar Matrícula",
      description: "Indique o motivo do cancelamento. Esta ação não pode ser revertida.",
      reasonLabel: "Motivo *",
      required: true,
      confirmLabel: "Cancelar Matrícula",
      variant: "destructive" as const,
    },
    complete: {
      title: "Concluir Matrícula",
      description: "Confirme a conclusão desta matrícula.",
      reasonLabel: "Nota (opcional)",
      required: false,
      confirmLabel: "Concluir",
      variant: "default" as const,
    },
  };

  const current = dialog ? dialogConfig[dialog] : null;
  const isConfirmDisabled = current?.required && !reason.trim();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canActivate && transitions.includes("ACTIVE") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setDialog("activate"); setReason(""); }}
          >
            <CheckCircle className="size-4 mr-1.5" />
            Ativar
          </Button>
        )}
        {canSuspend && transitions.includes("SUSPENDED") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setDialog("suspend"); setReason(""); }}
          >
            <PauseCircle className="size-4 mr-1.5" />
            Suspender
          </Button>
        )}
        {canComplete && transitions.includes("COMPLETED") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setDialog("complete"); setReason(""); }}
          >
            <BadgeCheck className="size-4 mr-1.5" />
            Concluir
          </Button>
        )}
        {canCancel && transitions.includes("CANCELLED") && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => { setDialog("cancel"); setReason(""); }}
          >
            <XCircle className="size-4 mr-1.5" />
            Cancelar
          </Button>
        )}
      </div>

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{current?.title}</DialogTitle>
            <DialogDescription>{current?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="status-reason">{current?.reasonLabel}</Label>
              <Input
                id="status-reason"
                placeholder="Introduza o motivo..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={loading}>
              Cancelar
            </Button>
            <Button
              variant={current?.variant ?? "default"}
              onClick={handleAction}
              disabled={loading || !!isConfirmDisabled}
              loading={loading}
            >
              {current?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
