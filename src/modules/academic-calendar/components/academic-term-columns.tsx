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
import type { AcademicTerm } from "@/modules/academic-calendar/types";

interface GetAcademicTermColumnsOptions {
  onEdit: (term: AcademicTerm) => void;
  onArchive: (term: AcademicTerm) => void;
  onDelete: (term: AcademicTerm) => void;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  showYear?: boolean;
}

export function getAcademicTermColumns({
  onEdit,
  onArchive,
  onDelete,
  canEdit,
  canArchive,
  canDelete,
  showYear = true,
}: GetAcademicTermColumnsOptions): ColumnDef<AcademicTerm>[] {
  const cols: ColumnDef<AcademicTerm>[] = [
    {
      accessorKey: "order",
      header: "Ordem",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums font-mono text-muted-foreground">
          {row.original.order}
        </span>
      ),
    },
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
  ];

  if (showYear) {
    cols.push({
      accessorKey: "yearName",
      header: "Ano Letivo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.yearName ?? "—"}</span>
      ),
    });
  }

  cols.push(
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
        const t = row.original;
        const isArchived = t.status === "ARCHIVED";
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
                <DropdownMenuItem onClick={() => onEdit(t)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {(canArchive || canDelete) && <DropdownMenuSeparator />}
              {canArchive && !isArchived && (
                <DropdownMenuItem
                  onClick={() => onArchive(t)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(t)}
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
    }
  );

  return cols;
}
