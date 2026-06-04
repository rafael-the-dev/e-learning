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
  reorderCourseLevelsAction,
} from "@/modules/courses/actions/level.actions";
import { toast } from "@/shared/hooks/use-toast";
import {
  Layers,
  MoreHorizontal,
  Pencil,
  Archive,
  Trash2,
  Plus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import type { CourseLevel } from "@/modules/courses/types";

interface LevelsTableProps {
  courseId: string;
  levels: CourseLevel[];
  canManage?: boolean;
}

export function LevelsTable({ courseId, levels, canManage = false }: LevelsTableProps) {
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

  async function handleMove(levelId: string, direction: "up" | "down") {
    const sorted = [...levels].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((l) => l.id === levelId);
    if (idx === -1) return;
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const reordered = [...sorted];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    const levelIds = reordered.map((l) => l.id);

    setIsProcessing(true);
    const res = await reorderCourseLevelsAction({ courseId, levelIds });
    setIsProcessing(false);
    if (res.success) {
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const sorted = [...levels].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{levels.length} nível(is)</p>
        {canManage && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-1.5" />
            Novo Nível
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Layers className="size-8" />}
          title="Nenhum nível criado"
          description={
            canManage
              ? "Adicione o primeiro nível ao curso."
              : "Nenhum nível encontrado para este curso."
          }
          action={
            canManage ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="size-4 mr-1.5" />
                Criar primeiro nível
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-xl border divide-y">
          {sorted.map((level, idx) => (
            <div
              key={level.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-muted-foreground w-6 text-right shrink-0 tabular-nums">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{level.name}</p>
                  {level.code && (
                    <p className="text-xs text-muted-foreground font-mono">
                      {level.code}
                    </p>
                  )}
                  {level.description && (
                    <p className="text-xs text-muted-foreground truncate max-w-xs hidden sm:block">
                      {level.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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

                {canManage && (
                  <>
                    <div className="flex flex-col">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5"
                        disabled={idx === 0 || isProcessing}
                        onClick={() => handleMove(level.id, "up")}
                        title="Mover para cima"
                      >
                        <ChevronUp className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-5"
                        disabled={idx === sorted.length - 1 || isProcessing}
                        onClick={() => handleMove(level.id, "down")}
                        title="Mover para baixo"
                      >
                        <ChevronDown className="size-3" />
                      </Button>
                    </div>

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
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
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
            description={`Tem a certeza que pretende eliminar "${deleteTarget?.name}"? Esta ação não pode ser revertida.`}
            confirmLabel="Eliminar"
            variant="destructive"
            loading={isProcessing}
            onConfirm={handleDelete}
          />
        </>
      )}
    </div>
  );
}
