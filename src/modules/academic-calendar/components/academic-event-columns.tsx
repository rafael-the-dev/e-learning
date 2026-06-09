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
import { ACADEMIC_EVENT_TYPE_LABELS } from "@/modules/academic-calendar/types";
import type { AcademicEvent } from "@/modules/academic-calendar/types";

interface GetAcademicEventColumnsOptions {
  onEdit: (event: AcademicEvent) => void;
  onArchive: (event: AcademicEvent) => void;
  onDelete: (event: AcademicEvent) => void;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getAcademicEventColumns({
  onEdit,
  onArchive,
  onDelete,
  canEdit,
  canArchive,
  canDelete,
}: GetAcademicEventColumnsOptions): ColumnDef<AcademicEvent>[] {
  return [
    {
      accessorKey: "title",
      header: "Título",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.title}</span>
      ),
    },
    {
      accessorKey: "eventType",
      header: "Tipo",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {ACADEMIC_EVENT_TYPE_LABELS[row.original.eventType] ?? row.original.eventType}
        </Badge>
      ),
    },
    {
      accessorKey: "yearName",
      header: "Ano Letivo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.yearName ?? "—"}</span>
      ),
    },
    {
      accessorKey: "termName",
      header: "Período",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.termName ?? "—"}</span>
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
        const e = row.original;
        const isArchived = e.status === "ARCHIVED";
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
                <DropdownMenuItem onClick={() => onEdit(e)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {(canArchive || canDelete) && <DropdownMenuSeparator />}
              {canArchive && !isArchived && (
                <DropdownMenuItem
                  onClick={() => onArchive(e)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(e)}
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
