"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { CreateScheduleDrawer, EditScheduleDrawer } from "./class-schedule-form";
import { deleteClassScheduleAction } from "@/modules/class-groups/actions/class-schedule.actions";
import { toast } from "@/shared/hooks/use-toast";
import { Clock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { DAY_OF_WEEK_LABELS } from "@/modules/class-groups/types";
import type { ClassSchedule } from "@/modules/class-groups/types";

interface ClassSchedulePanelProps {
  classGroupId: string;
  schedules: ClassSchedule[];
  canManage: boolean;
  canDeleteSchedule: boolean;
}

export function ClassSchedulePanel({
  classGroupId,
  schedules,
  canManage,
  canDeleteSchedule,
}: ClassSchedulePanelProps) {
  const router = useRouter();
  const [showCreate, setShowCreate] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ClassSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ClassSchedule | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteClassScheduleAction(classGroupId, deleteTarget.id);
    setIsDeleting(false);
    if (res.success) {
      toast.success("Horário eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const sorted = [...schedules].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startTime.localeCompare(b.startTime);
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{schedules.length} horário(s)</p>
        {canManage && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-1.5" />
            Adicionar
          </Button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-8" />}
          title="Sem horários definidos"
          description={
            canManage
              ? "Adicione o primeiro horário a esta turma."
              : "Nenhum horário definido para esta turma."
          }
          action={
            canManage ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="size-4 mr-1.5" />
                Adicionar horário
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-xl border divide-y">
          {sorted.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Clock className="size-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {DAY_OF_WEEK_LABELS[s.dayOfWeek]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.startTime} — {s.endTime}
                    {s.room && (
                      <span className="ml-2 text-muted-foreground">· {s.room}</span>
                    )}
                  </p>
                </div>
              </div>
              {(canManage || canDeleteSchedule) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-7">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canManage && (
                      <DropdownMenuItem onClick={() => setEditTarget(s)}>
                        <Pencil className="size-4" />
                        Editar
                      </DropdownMenuItem>
                    )}
                    {canManage && canDeleteSchedule && <DropdownMenuSeparator />}
                    {canDeleteSchedule && (
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(s)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        Eliminar
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <CreateScheduleDrawer
            classGroupId={classGroupId}
            open={showCreate}
            onOpenChange={setShowCreate}
            onSuccess={() => router.refresh()}
          />
          {editTarget && (
            <EditScheduleDrawer
              classGroupId={classGroupId}
              schedule={editTarget}
              open={!!editTarget}
              onOpenChange={(open) => !open && setEditTarget(null)}
              onSuccess={() => router.refresh()}
            />
          )}
        </>
      )}
      {canDeleteSchedule && (
        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Eliminar Horário"
          description={
            deleteTarget
              ? `Tem a certeza que pretende eliminar o horário de ${DAY_OF_WEEK_LABELS[deleteTarget.dayOfWeek]} (${deleteTarget.startTime} — ${deleteTarget.endTime})?`
              : ""
          }
          confirmLabel="Eliminar"
          variant="destructive"
          loading={isDeleting}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
