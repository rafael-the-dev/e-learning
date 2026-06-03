"use client";

import * as React from "react";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  suspendTeacherAction,
  deleteTeacherAction,
} from "@/modules/teachers/actions/teacher.actions";
import { toast } from "@/shared/hooks/use-toast";
import { useRouter } from "next/navigation";
import { PauseCircle, Trash2 } from "lucide-react";
import type { Teacher } from "@/modules/teachers/types";

interface TeacherDetailActionsProps {
  teacher: Teacher;
}

export function TeacherDetailActions({ teacher }: TeacherDetailActionsProps) {
  const router = useRouter();
  const [showSuspend, setShowSuspend] = React.useState(false);
  const [showDelete, setShowDelete] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function handleSuspend() {
    setIsProcessing(true);
    const res = await suspendTeacherAction(teacher.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Professor suspenso");
      setShowSuspend(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    setIsProcessing(true);
    const res = await deleteTeacherAction(teacher.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Professor arquivado");
      setShowDelete(false);
      router.push("/teachers");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {teacher.status !== "SUSPENDED" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSuspend(true)}
          >
            <PauseCircle className="size-4 mr-1.5" />
            Suspender
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setShowDelete(true)}
        >
          <Trash2 className="size-4 mr-1.5" />
          Arquivar
        </Button>
      </div>

      <ConfirmDialog
        open={showSuspend}
        onOpenChange={setShowSuspend}
        title="Suspender Professor"
        description={`Tem a certeza que pretende suspender "${teacher.fullName}"? O professor ficará sem acesso a novas turmas.`}
        confirmLabel="Suspender"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleSuspend}
      />

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Arquivar Professor"
        description={`Tem a certeza que pretende arquivar "${teacher.fullName}"? O registo ficará oculto mas poderá ser recuperado por um administrador.`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </>
  );
}
