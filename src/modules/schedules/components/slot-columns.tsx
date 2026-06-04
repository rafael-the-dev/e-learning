"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Archive, Trash2 } from "lucide-react";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { DAY_OF_WEEK_LABELS } from "@/modules/schedules/types";
import type { ScheduleSlot } from "@/modules/schedules/types";

interface GetSlotColumnsOptions {
  onEdit: (slot: ScheduleSlot) => void;
  onArchive: (slot: ScheduleSlot) => void;
  onDelete: (slot: ScheduleSlot) => void;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getScheduleSlotColumns({
  onEdit,
  onArchive,
  onDelete,
  canEdit,
  canArchive,
  canDelete,
}: GetSlotColumnsOptions): ColumnDef<ScheduleSlot>[] {
  return [
    {
      accessorKey: "periodName",
      header: "Período",
      cell: ({ row }) => (
        <div>
          <span className="text-sm font-medium">{row.original.periodName}</span>
          <span className="ml-1.5 text-xs font-mono text-muted-foreground">
            {row.original.periodCode}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "dayOfWeek",
      header: "Dia",
      cell: ({ row }) => (
        <span className="text-sm">{DAY_OF_WEEK_LABELS[row.original.dayOfWeek] ?? row.original.dayOfWeek}</span>
      ),
    },
    {
      id: "time",
      header: "Horário",
      cell: ({ row }) => {
        const s = row.original;
        return (
          <span className="text-sm tabular-nums">
            {s.startTime} — {s.endTime}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const s = row.original;
        const showSep = canEdit && (canArchive || canDelete);
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                Ações
              </DropdownMenuLabel>
              {canEdit && (
                <DropdownMenuItem onClick={() => onEdit(s)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {showSep && <DropdownMenuSeparator />}
              {canArchive && s.status !== "ARCHIVED" && (
                <DropdownMenuItem
                  onClick={() => onArchive(s)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(s)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
