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
import { CreateLevelDrawer, EditLevelDrawer } from "@/modules/courses/components/level-form";
import {
  archiveCourseLevelAction,
  deleteCourseLevelAction,
} from "@/modules/courses/actions/level.actions";
import { toast } from "@/shared/hooks/use-toast";
import { Layers, MoreHorizontal, Pencil, Archive, Trash2, Plus } from "lucide-react";
import type { CourseLevel } from "@/modules/courses/types";

interface LevelsTableProps {
  courseId: string;
  levels: CourseLevel[];
}

export function LevelsTable({ courseId, levels }: LevelsTableProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<CourseLevel | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<CourseLevel | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CourseLevel | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsProcessing(true);
    const res = await archiveCourseLevelAction(courseId, archiveTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Nível arquivado");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsProcessing(true);
    const res = await deleteCourseLevelAction(courseId, deleteTarget.id);
    setIsProcessing(false);
    if (res.success) {
      toast.success("Nível eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{levels.length} nível(is)</p>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="size-4 mr-1.5" />
          Novo Nível
        </Button>
      </div>

      {levels.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-8" />}
          title="Nenhum nível criado"
          description="Adicione o primeiro nível ao curso."
        />
      ) : (
        <div className="rounded-xl border divide-y">
          {levels.map((level) => (
            <div
              key={level.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-muted-foreground w-6 text-right shrink-0">
                  {level.order}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{level.name}</p>
                  {level.code && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {level.code}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {level.totalHours && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {level.totalHours}h
                  </span>
                )}
                {level.subjectsCount !== undefined && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {level.subjectsCount} disciplina(s)
                  </span>
                )}
                <StatusBadge status={level.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditTarget(level)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {level.status !== "ARCHIVED" && (
                      <DropdownMenuItem
                        onClick={() => setArchiveTarget(level)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Archive className="size-4" />
                        Arquivar
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => setDeleteTarget(level)}
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

      <CreateLevelDrawer
        courseId={courseId}
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => router.refresh()}
      />

      {editTarget && (
        <EditLevelDrawer
          courseId={courseId}
          level={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Nível"
        description={`Tem a certeza que pretende arquivar "${archiveTarget?.name}"?`}
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Nível"
        description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"? Todas as disciplinas deste nível serão removidas.`}
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleDelete}
      />
    </div>
  );
}
