"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Archive, Trash2 } from "lucide-react";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import type { AcademicHoliday } from "@/modules/academic-calendar/types";

interface GetAcademicHolidayColumnsOptions {
  onEdit: (holiday: AcademicHoliday) => void;
  onArchive: (holiday: AcademicHoliday) => void;
  onDelete: (holiday: AcademicHoliday) => void;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getAcademicHolidayColumns({
  onEdit,
  onArchive,
  onDelete,
  canEdit,
  canArchive,
  canDelete,
}: GetAcademicHolidayColumnsOptions): ColumnDef<AcademicHoliday>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.isRecurring && (
            <Badge variant="outline" className="text-xs">Recorrente</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "yearName",
      header: "Ano Letivo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.yearName ?? "Geral"}</span>
      ),
    },
    {
      accessorKey: "startDate",
      header: "Início",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {new Date(row.original.startDate).toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    {
      accessorKey: "endDate",
      header: "Fim",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">
          {new Date(row.original.endDate).toLocaleDateString("pt-PT")}
        </span>
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
        const h = row.original;
        const isArchived = h.status === "ARCHIVED";
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
              {canEdit && !isArchived && (
                <DropdownMenuItem onClick={() => onEdit(h)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {(canArchive || canDelete) && <DropdownMenuSeparator />}
              {canArchive && !isArchived && (
                <DropdownMenuItem
                  onClick={() => onArchive(h)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(h)}
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
