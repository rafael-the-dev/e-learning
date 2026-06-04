"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Button } from "@/shared/components/ui/button";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { CreateScheduleSlotDrawer, EditScheduleSlotDrawer } from "./schedule-slot-form";
import { toast } from "@/shared/hooks/use-toast";
import {
  archiveScheduleSlotAction,
  deleteScheduleSlotAction,
} from "@/modules/schedules/actions/schedule-slot.actions";
import { getScheduleSlotColumns } from "./slot-columns";
import {
  DAY_OF_WEEK_LABELS,
  SCHEDULE_STATUS_LABELS,
} from "@/modules/schedules/types";
import { Plus, Clock } from "lucide-react";
import type { SchedulePeriod, ScheduleSlot } from "@/modules/schedules/types";
import type { PaginatedResult } from "@/shared/types/common";

interface ScheduleSlotsTableProps {
  result: PaginatedResult<ScheduleSlot>;
  periods: SchedulePeriod[];
  defaultPeriodId?: string;
  defaultDayOfWeek?: string;
  defaultStatus?: string;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function ScheduleSlotsTable({
  result,
  periods,
  defaultPeriodId,
  defaultDayOfWeek,
  defaultStatus,
  canCreate,
  canEdit,
  canArchive,
  canDelete,
}: ScheduleSlotsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [showCreate, setShowCreate] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ScheduleSlot | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<ScheduleSlot | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ScheduleSlot | null>(null);
  const [isArchiving, setIsArchiving] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.push(`${pathname}?${params.toString()}`);
  }

  function handlePaginationChange(p: PaginationState) {
    updateParams({ page: String(p.pageIndex + 1) });
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    setIsArchiving(true);
    const res = await archiveScheduleSlotAction(archiveTarget.id);
    setIsArchiving(false);
    if (res.success) {
      toast.success("Slot arquivado");
      setArchiveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const res = await deleteScheduleSlotAction(deleteTarget.id);
    setIsDeleting(false);
    if (res.success) {
      toast.success("Slot eliminado");
      setDeleteTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const columns = getScheduleSlotColumns({
    onEdit: setEditTarget,
    onArchive: setArchiveTarget,
    onDelete: setDeleteTarget,
    canEdit,
    canArchive,
    canDelete,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            defaultValue={defaultPeriodId ?? "ALL"}
            onValueChange={(v) => updateParams({ periodId: v === "ALL" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os períodos</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            defaultValue={defaultDayOfWeek ?? "ALL"}
            onValueChange={(v) => updateParams({ dayOfWeek: v === "ALL" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Dia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os dias</SelectItem>
              {Object.entries(DAY_OF_WEEK_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            defaultValue={defaultStatus ?? "ALL"}
            onValueChange={(v) => updateParams({ slotStatus: v === "ALL" ? "" : v, page: "1" })}
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {(["ACTIVE", "INACTIVE", "ARCHIVED"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {SCHEDULE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4 mr-1.5" />
            Novo Slot
          </Button>
        )}
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<Clock className="size-8" />}
          title="Nenhum slot encontrado"
          description={canCreate ? "Crie o primeiro slot de horário." : "Nenhum slot definido."}
          action={
            canCreate ? (
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="size-4 mr-1.5" />
                Novo Slot
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={pagination}
          onPaginationChange={handlePaginationChange}
        />
      )}

      {canCreate && (
        <CreateScheduleSlotDrawer
          periods={periods}
          defaultPeriodId={defaultPeriodId}
          open={showCreate}
          onOpenChange={setShowCreate}
          onSuccess={() => router.refresh()}
        />
      )}

      {editTarget && (
        <EditScheduleSlotDrawer
          slot={editTarget}
          open={!!editTarget}
          onOpenChange={(open) => !open && setEditTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Arquivar Slot"
        description={
          archiveTarget
            ? `Tem a certeza que pretende arquivar o slot de ${DAY_OF_WEEK_LABELS[archiveTarget.dayOfWeek]} (${archiveTarget.startTime} — ${archiveTarget.endTime})?`
            : ""
        }
        confirmLabel="Arquivar"
        variant="destructive"
        loading={isArchiving}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Eliminar Slot"
        description={
          deleteTarget
            ? `Tem a certeza que pretende eliminar o slot de ${DAY_OF_WEEK_LABELS[deleteTarget.dayOfWeek]} (${deleteTarget.startTime} — ${deleteTarget.endTime})? Esta ação não pode ser revertida.`
            : ""
        }
        confirmLabel="Eliminar"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
