"use client";

import * as React from "react";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { suspendStudentAction, deleteStudentAction } from "@/modules/students/actions/student.actions";
import { toast } from "@/shared/hooks/use-toast";
import { useRouter } from "next/navigation";
import { PauseCircle, Trash2 } from "lucide-react";
import type { Student } from "@/modules/students/types";

interface StudentDetailActionsProps {
  student: Student;
}

export function StudentDetailActions({ student }: StudentDetailActionsProps) {
  const router = useRouter();
  const [showSuspend, setShowSuspend] = React.useState(false);
  const [showDelete, setShowDelete] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function handleSuspend() {
    setIsProcessing(true);
    const res = await suspendStudentAction(student.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Aluno suspenso");
      setShowSuspend(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    setIsProcessing(true);
    const res = await deleteStudentAction(student.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Aluno arquivado");
      setShowDelete(false);
      router.push("/students");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {student.status !== "SUSPENDED" && (
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
        title="Suspender Aluno"
        description={`Tem a certeza que pretende suspender "${student.fullName}"? O aluno ficará sem acesso a novas inscrições.`}
        confirmLabel="Suspender"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleSuspend}
      />

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Arquivar Aluno"
        description={`Tem a certeza que pretende arquivar "${student.fullName}"? O registo ficará oculto mas poderá ser recuperado por um administrador.`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </>
  );
}
