"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { toast } from "@/shared/hooks/use-toast";
import {
  assignScheduleSlotAction,
  removeScheduleSlotAction,
} from "@/modules/schedules/actions/class-group-schedule.actions";
import {
  DAY_OF_WEEK_LABELS,
  DAY_OF_WEEK_ORDER,
} from "@/modules/schedules/types";
import { Clock, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { ClassGroupScheduleWithSlot, ScheduleSlot } from "@/modules/schedules/types";

interface ClassGroupSchedulePanelProps {
  classGroupId: string;
  schedules: ClassGroupScheduleWithSlot[];
  availableSlots: ScheduleSlot[];
  canAssign: boolean;
  canRemove: boolean;
}

export function ClassGroupSchedulePanel({
  classGroupId,
  schedules,
  availableSlots,
  canAssign,
  canRemove,
}: ClassGroupSchedulePanelProps) {
  const router = useRouter();
  const [selectedSlotId, setSelectedSlotId] = React.useState<string>("");
  const [isAssigning, setIsAssigning] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<ClassGroupScheduleWithSlot | null>(null);
  const [isRemoving, setIsRemoving] = React.useState(false);

  const assignedSlotIds = new Set(schedules.map((s) => s.scheduleSlotId));
  const unassignedSlots = availableSlots.filter((s) => !assignedSlotIds.has(s.id));

  async function handleAssign() {
    if (!selectedSlotId) return;
    setIsAssigning(true);
    const result = await assignScheduleSlotAction(classGroupId, selectedSlotId);
    setIsAssigning(false);
    if (result.success) {
      toast.success("Slot atribuído");
      setSelectedSlotId("");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsRemoving(true);
    const result = await removeScheduleSlotAction(removeTarget.id);
    setIsRemoving(false);
    if (result.success) {
      toast.success("Slot removido");
      setRemoveTarget(null);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  const grouped = React.useMemo(() => {
    const map = new Map<string, { periodName: string; items: ClassGroupScheduleWithSlot[] }>();
    const sorted = [...schedules].sort(
      (a, b) =>
        (DAY_OF_WEEK_ORDER[a.slot.dayOfWeek] ?? 0) - (DAY_OF_WEEK_ORDER[b.slot.dayOfWeek] ?? 0) ||
        a.slot.startTime.localeCompare(b.slot.startTime)
    );
    for (const s of sorted) {
      const key = s.slot.schedulePeriodId;
      if (!map.has(key)) {
        map.set(key, { periodName: s.slot.periodName, items: [] });
      }
      map.get(key)!.items.push(s);
    }
    return map;
  }, [schedules]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{schedules.length} slot(s) atribuído(s)</p>
      </div>

      {schedules.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-8" />}
          title="Sem horários atribuídos"
          description={
            canAssign
              ? "Atribua slots existentes a esta turma."
              : "Nenhum horário atribuído a esta turma."
          }
        />
      ) : (
        <div className="space-y-4">
          {[...grouped.entries()].map(([periodId, { periodName, items }]) => (
            <div key={periodId} className="rounded-xl border">
              <div className="px-4 py-2 border-b bg-muted/40 rounded-t-xl">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {periodName}
                </p>
              </div>
              <div className="divide-y">
                {items.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Clock className="size-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {DAY_OF_WEEK_LABELS[s.slot.dayOfWeek]}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.slot.startTime} — {s.slot.endTime}
                        </p>
                      </div>
                    </div>
                    {canRemove && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-7">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setRemoveTarget(s)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {canAssign && unassignedSlots.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select value={selectedSlotId} onValueChange={setSelectedSlotId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Selecione um slot para atribuir…" />
            </SelectTrigger>
            <SelectContent>
              {unassignedSlots.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.periodName} — {DAY_OF_WEEK_LABELS[s.dayOfWeek]} {s.startTime}–{s.endTime}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedSlotId || isAssigning}
            loading={isAssigning}
            onClick={handleAssign}
          >
            <Plus className="size-4 mr-1" />
            Atribuir
          </Button>
        </div>
      )}

      {canAssign && unassignedSlots.length === 0 && schedules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Todos os slots disponíveis já estão atribuídos a esta turma.
        </p>
      )}

      {canAssign && availableSlots.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Não existem slots ativos. Crie slots em{" "}
          <Link href="/schedules" className="underline">
            Horários
          </Link>
          .
        </p>
      )}

      {canRemove && (
        <ConfirmDialog
          open={!!removeTarget}
          onOpenChange={(open) => !open && setRemoveTarget(null)}
          title="Remover Slot"
          description={
            removeTarget
              ? `Tem a certeza que pretende remover o slot de ${DAY_OF_WEEK_LABELS[removeTarget.slot.dayOfWeek]} (${removeTarget.slot.startTime} — ${removeTarget.slot.endTime}) desta turma?`
              : ""
          }
          confirmLabel="Remover"
          variant="destructive"
          loading={isRemoving}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
