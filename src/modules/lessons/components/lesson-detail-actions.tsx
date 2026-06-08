"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";
import {
  publishLessonAction,
  archiveLessonAction,
  deleteLessonAction,
} from "@/modules/lessons/actions/lesson.actions";
import { ChevronDown, Send, Archive, Trash2 } from "lucide-react";
import type { Lesson } from "@/modules/lessons/types";

interface LessonDetailActionsProps {
  lesson: Lesson;
  canPublish: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function LessonDetailActions({
  lesson,
  canPublish,
  canArchive,
  canDelete,
}: LessonDetailActionsProps) {
  const router = useRouter();
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const hasActions =
    (canPublish && lesson.status === "DRAFT") ||
    (canArchive && lesson.status !== "ARCHIVED") ||
    canDelete;

  if (!hasActions) return null;

  async function handlePublish() {
    setLoading(true);
    const res = await publishLessonAction(lesson.id);
    setLoading(false);
    if (res.success) {
      toast.success("Lição publicada");
      setPublishOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleArchive() {
    setLoading(true);
    const res = await archiveLessonAction(lesson.id);
    setLoading(false);
    if (res.success) {
      toast.success("Lição arquivada");
      setArchiveOpen(false);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    setLoading(true);
    const res = await deleteLessonAction(lesson.id);
    setLoading(false);
    if (res.success) {
      toast.success("Lição eliminada");
      setDeleteOpen(false);
      router.push("/lessons");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            Ações
            <ChevronDown className="size-4 ml-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canPublish && lesson.status === "DRAFT" && (
            <DropdownMenuItem onClick={() => setPublishOpen(true)}>
              <Send className="size-4 mr-2" />
              Publicar
            </DropdownMenuItem>
          )}
          {canArchive && lesson.status !== "ARCHIVED" && (
            <DropdownMenuItem onClick={() => setArchiveOpen(true)}>
              <Archive className="size-4 mr-2" />
              Arquivar
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDeleteOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-4 mr-2" />
                Eliminar
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publicar Lição"
        description={`Tem a certeza que pretende publicar "${lesson.title}"? Ficará visível para os alunos.`}
        confirmLabel="Publicar"
        loading={loading}
        onConfirm={handlePublish}
      />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Arquivar Lição"
        description={`Tem a certeza que pretende arquivar "${lesson.title}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={loading}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar Lição"
        description={`Tem a certeza que pretende eliminar "${lesson.title}"? Esta ação não pode ser revertida.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={loading}
        onConfirm={handleDelete}
      />
    </>
  );
}
