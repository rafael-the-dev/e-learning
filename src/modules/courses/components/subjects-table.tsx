"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  CreateSubjectDrawer,
  EditSubjectDrawer,
} from "@/modules/courses/components/subject-form";
import {
  archiveSubjectAction,
  deleteSubjectAction,
} from "@/modules/courses/actions/subject.actions";
import { toast } from "@/shared/hooks/use-toast";
import {
  BookOpen,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Plus,
} from "lucide-react";
import type { CourseLevel, Subject } from "@/modules/courses/types";

interface SubjectsTableProps {
  courseId: string;
  subjects: Subject[];
  levels: CourseLevel[];
}

export function SubjectsTable({
  courseId,
  subjects,
  levels,
}: SubjectsTableProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Subject | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<Subject | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Subject | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsProcessing(true);
    const res = await archiveSubjectAction(courseId, archiveTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Disciplina arquivada");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const res = await deleteSubjectAction(courseId, deleteTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Disciplina eliminada");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {subjects.length} disciplina(s)
        </p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-1.5" />
          Nova Disciplina
        </Button>
      </div>

      {subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="Nenhuma disciplina criada"
          description="Adicione a primeira disciplina ao curso."
        />
      ) : (
        <div className="rounded-xl border divide-y">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                  {subject.order}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{subject.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {subject.levelName ?? "—"}
                    {subject.code && (
                      <span className="font-mono ml-2">{subject.code}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {subject.hoursRequired && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {subject.hoursRequired}h
                  </span>
                )}
                <StatusBadge status={subject.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditTarget(subject)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {subject.status !== "ARCHIVED" && (
                      <DropdownMenuItem
                        onClick={() => setArchiveTarget(subject)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Archive className="size-4" />
                        Arquivar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(subject)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Eliminar
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateSubjectDrawer
        courseId={courseId}
        levels={levels}
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => router.refresh()}
      />

      {editTarget && (
        <EditSubjectDrawer
          courseId={courseId}
          levels={levels}
          subject={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Disciplina"
        description={`Tem a certeza que pretende arquivar "${archiveTarget?.name}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Disciplina"
        description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"?`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </div>
  );
}
