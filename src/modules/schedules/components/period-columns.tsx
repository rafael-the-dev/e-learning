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
import type { SchedulePeriod } from "@/modules/schedules/types";

interface GetPeriodColumnsOptions {
  onEdit: (period: SchedulePeriod) => void;
  onArchive: (period: SchedulePeriod) => void;
  onDelete: (period: SchedulePeriod) => void;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getSchedulePeriodColumns({
  onEdit,
  onArchive,
  onDelete,
  canEdit,
  canArchive,
  canDelete,
}: GetPeriodColumnsOptions): ColumnDef<SchedulePeriod>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ row }) => (
        <span className="text-sm font-mono text-muted-foreground">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Descrição",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.description ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "slotsCount",
      header: "Slots",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.slotsCount ?? 0}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const p = row.original;
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
                <DropdownMenuItem onClick={() => onEdit(p)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {showSep && <DropdownMenuSeparator />}
              {canArchive && p.status !== "ARCHIVED" && (
                <DropdownMenuItem
                  onClick={() => onArchive(p)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(p)}
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
