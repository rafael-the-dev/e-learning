"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import {
  assignTeacherSubjectAction,
  removeTeacherSubjectAction,
} from "@/modules/teachers/actions/teacher.actions";
import type { Subject } from "@/modules/courses/types";

interface TeacherSubjectsAssignControlProps {
  teacherId: string;
  availableSubjects: Subject[];
  canAssign: boolean;
}

export function TeacherSubjectsAssignControl({
  teacherId,
  availableSubjects,
  canAssign,
}: TeacherSubjectsAssignControlProps) {
  const router = useRouter();
  const [subjectId, setSubjectId] = React.useState("");
  const [isAssigning, setIsAssigning] = React.useState(false);

  if (!canAssign) return null;

  async function handleAssign() {
    if (!subjectId) return;
    setIsAssigning(true);
    const res = await assignTeacherSubjectAction(teacherId, subjectId);
    setIsAssigning(false);
    if (res.success) {
      toast.success("Disciplina atribuída");
      setSubjectId("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  if (availableSubjects.length === 0) {
    return <p className="text-xs text-muted-foreground">Todas as disciplinas ativas já estão atribuídas.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={subjectId} onValueChange={setSubjectId}>
        <SelectTrigger className="flex-1 max-w-xs">
          <SelectValue placeholder="Selecione uma disciplina…" />
        </SelectTrigger>
        <SelectContent>
          {availableSubjects.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
              {s.code ? ` (${s.code})` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!subjectId || isAssigning} loading={isAssigning} onClick={handleAssign}>
        <Plus className="size-4 mr-1" />
        Atribuir
      </Button>
    </div>
  );
}

export function TeacherSubjectRemoveButton({
  teacherId,
  subjectId,
  subjectName,
  canRemove,
}: { teacherId: string; subjectId: string; subjectName: string; canRemove: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isRemoving, setIsRemoving] = React.useState(false);

  if (!canRemove) return null;

  async function handleRemove() {
    setIsRemoving(true);
    const res = await removeTeacherSubjectAction(teacherId, subjectId);
    setIsRemoving(false);
    if (res.success) {
      toast.success("Disciplina removida");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remover Disciplina"
        description={`Tem a certeza que pretende remover "${subjectName}" deste professor?`}
        confirmLabel="Remover"
        variant="destructive"
        loading={isRemoving}
        onConfirm={handleRemove}
      />
    </>
  );
}
