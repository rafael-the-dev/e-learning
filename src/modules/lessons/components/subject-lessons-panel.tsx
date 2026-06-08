"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataTable } from "@/shared/components/data/data-table";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { toast } from "@/shared/hooks/use-toast";
import {
  removeLessonFromSubjectAction,
  reorderSubjectLessonsAction,
} from "@/modules/lessons/actions/subject-lesson.actions";
import { getSubjectLessonColumns } from "./subject-lesson-columns";
import { AssignLessonDrawer, EditSubjectLessonDrawer } from "./subject-lesson-form";
import { BookOpen, Plus } from "lucide-react";
import type { SubjectLesson, Lesson } from "@/modules/lessons/types";
import type { PaginationState } from "@tanstack/react-table";

interface SubjectLessonsPanelProps {
  subjectId: string;
  subjectLessons: SubjectLesson[];
  availableLessons: Lesson[];
  canAssign: boolean;
  canEdit: boolean;
  canRemove: boolean;
  canReorder: boolean;
}

export function SubjectLessonsPanel({
  subjectId,
  subjectLessons,
  availableLessons,
  canAssign,
  canEdit,
  canRemove,
  canReorder,
}: SubjectLessonsPanelProps) {
  const router = useRouter();

  const [showAssign, setShowAssign] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<SubjectLesson | null>(null);
  const [removeTarget, setRemoveTarget] = React.useState<SubjectLesson | null>(null);
  const [isRemoving, setIsRemoving] = React.useState(false);

  const [orderedItems, setOrderedItems] = React.useState(subjectLessons);

  React.useEffect(() => {
    setOrderedItems(subjectLessons);
  }, [subjectLessons]);

  const pagination: PaginationState = { pageIndex: 0, pageSize: orderedItems.length || 20 };

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    const res = await removeLessonFromSubjectAction(removeTarget.id, subjectId);
    setIsRemoving(false);
    if (res.success) {
      toast.success("Lição removida da disciplina");
      setRemoveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleMoveUp(index: number) {
    if (index === 0 || !canReorder) return;
    const next = [...orderedItems];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrderedItems(next);
    const res = await reorderSubjectLessonsAction({
      subjectId,
      orderedIds: next.map((i) => i.id),
    });
    if (!res.success) {
      toast.error(res.error);
      setOrderedItems(subjectLessons);
    } else {
      router.refresh();
    }
  }

  async function handleMoveDown(index: number) {
    if (index >= orderedItems.length - 1 || !canReorder) return;
    const next = [...orderedItems];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOrderedItems(next);
    const res = await reorderSubjectLessonsAction({
      subjectId,
      orderedIds: next.map((i) => i.id),
    });
    if (!res.success) {
      toast.error(res.error);
      setOrderedItems(subjectLessons);
    } else {
      router.refresh();
    }
  }

  const columns = getSubjectLessonColumns({
    onEdit: setEditTarget,
    onRemove: setRemoveTarget,
    canEdit,
    canRemove,
  });

  const assignableIds = new Set(subjectLessons.map((sl) => sl.lessonId));
  const assignableLessons = availableLessons.filter((l) => !assignableIds.has(l.id));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canAssign && (
          <Button size="sm" onClick={() => setShowAssign(true)} disabled={assignableLessons.length === 0}>
            <Plus className="size-4 mr-1.5" />
            Atribuir Lição
          </Button>
        )}
      </div>

      {orderedItems.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title="Nenhuma lição atribuída"
          description={
            canAssign
              ? "Atribua lições da biblioteca a esta disciplina."
              : "Nenhuma lição atribuída a esta disciplina."
          }
          action={
            canAssign && assignableLessons.length > 0 ? (
              <Button size="sm" onClick={() => setShowAssign(true)}>
                <Plus className="size-4 mr-1.5" />
                Atribuir Lição
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {canReorder && (
            <p className="text-xs text-muted-foreground">
              Use os botões de ordenação em cada linha para reordenar as lições.
            </p>
          )}
          <DataTable
            columns={[
              ...(canReorder
                ? [
                    {
                      id: "reorder",
                      header: "",
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      cell: ({ row }: any) => (
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            disabled={row.index === 0}
                            onClick={() => handleMoveUp(row.index)}
                            title="Mover para cima"
                          >
                            ↑
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            disabled={row.index >= orderedItems.length - 1}
                            onClick={() => handleMoveDown(row.index)}
                            title="Mover para baixo"
                          >
                            ↓
                          </Button>
                        </div>
                      ),
                    },
                  ]
                : []),
              ...columns,
            ]}
            data={orderedItems}
            totalRows={orderedItems.length}
            pagination={pagination}
            onPaginationChange={() => {}}
          />
        </div>
      )}

      {canAssign && (
        <AssignLessonDrawer
          subjectId={subjectId}
          availableLessons={assignableLessons}
          open={showAssign}
          onOpenChange={setShowAssign}
          onSuccess={() => router.refresh()}
        />
      )}

      {editTarget && (
        <EditSubjectLessonDrawer
          subjectLesson={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover Lição"
        description={
          removeTarget
            ? `Tem a certeza que pretende remover "${removeTarget.lesson?.title}" desta disciplina?`
            : ""
        }
        confirmLabel="Remover"
        variant="destructive"
        loading={isRemoving}
        onConfirm={handleRemove}
      />
    </div>
  );
}
