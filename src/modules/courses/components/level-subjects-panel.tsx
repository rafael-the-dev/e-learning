"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  AssignSubjectDrawer,
  EditLevelSubjectDrawer,
} from "@/modules/courses/components/level-subject-form";
import { removeSubjectFromLevelAction } from "@/modules/courses/actions/level-subject.actions";
import { toast } from "@/shared/hooks/use-toast";
import {
  BookOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  Clock,
  Star,
} from "lucide-react";
import type { LevelSubject, Subject } from "@/modules/courses/types";

interface LevelSubjectsPanelProps {
  courseId: string;
  courseLevelId: string;
  levelSubjects: LevelSubject[];
  availableSubjects: Subject[];
  canManage: boolean;
}

export function LevelSubjectsPanel({
  courseId,
  courseLevelId,
  levelSubjects,
  availableSubjects,
  canManage,
}: LevelSubjectsPanelProps) {
  const router = useRouter();
  const [showAssign, setShowAssign] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LevelSubject | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<LevelSubject | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const assignedSubjectIds = new Set(levelSubjects.map((ls) => ls.subjectId));
  const unassignedSubjects = availableSubjects.filter(
    (s) => !assignedSubjectIds.has(s.id)
  );

  async function handleRemove() {
    if (!removeTarget) return;
    setIsProcessing(true);
    const res = await removeSubjectFromLevelAction(
      courseId,
      courseLevelId,
      removeTarget.id
    );
    setIsProcessing(false);
    if (res.success) {
      toast.success("Disciplina removida do nível");
      setRemoveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {levelSubjects.length} disciplina(s) associada(s)
        </p>
        {canManage && (
          <Button
            size="sm"
            onClick={() => setShowAssign(true)}
            disabled={unassignedSubjects.length === 0}
          >
            <Plus className="size-4 mr-1.5" />
            Associar Disciplina
          </Button>
        )}
      </div>

      {levelSubjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="Nenhuma disciplina associada"
          description="Associe disciplinas a este nível para definir o currículo."
        />
      ) : (
        <div className="rounded-xl border divide-y">
          {levelSubjects.map((ls) => (
            <div
              key={ls.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                  {ls.order}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{ls.subjectName}</p>
                    {ls.isRequired && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        <Star className="size-2.5 mr-1" />
                        Obrigatória
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {ls.subjectCode && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {ls.subjectCode}
                      </span>
                    )}
                    {ls.workloadHours && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {ls.workloadHours}h
                      </span>
                    )}
                    {ls.minimumPassingGrade && (
                      <span className="text-xs text-muted-foreground">
                        Mín. {ls.minimumPassingGrade}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={ls.status} />
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditTarget(ls)}>
                        <Pencil className="size-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setRemoveTarget(ls)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Remover
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <AssignSubjectDrawer
          courseId={courseId}
          courseLevelId={courseLevelId}
          availableSubjects={unassignedSubjects}
          open={showAssign}
          onOpenChange={setShowAssign}
          onSuccess={() => router.refresh()}
        />
      )}

      {editTarget && canManage && (
        <EditLevelSubjectDrawer
          courseId={courseId}
          courseLevelId={courseLevelId}
          levelSubject={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover Disciplina do Nível"
        description={`Tem a certeza que pretende remover "${removeTarget?.subjectName}" deste nível?`}
        confirmLabel="Remover"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleRemove}
      />
    </div>
  );
}
