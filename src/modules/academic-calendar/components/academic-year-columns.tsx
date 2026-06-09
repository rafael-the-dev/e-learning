"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Archive, Trash2, Star } from "lucide-react";
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
import type { AcademicYear } from "@/modules/academic-calendar/types";

interface GetAcademicYearColumnsOptions {
  onEdit: (year: AcademicYear) => void;
  onSetDefault: (year: AcademicYear) => void;
  onArchive: (year: AcademicYear) => void;
  onDelete: (year: AcademicYear) => void;
  canEdit: boolean;
  canSetDefault: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getAcademicYearColumns({
  onEdit,
  onSetDefault,
  onArchive,
  onDelete,
  canEdit,
  canSetDefault,
  canArchive,
  canDelete,
}: GetAcademicYearColumnsOptions): ColumnDef<AcademicYear>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.isDefault && (
            <Badge variant="secondary" className="text-xs">Predefinido</Badge>
          )}
        </div>
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
      accessorKey: "termsCount",
      header: "Períodos",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.termsCount ?? 0}</span>
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
        const y = row.original;
        const isArchived = y.status === "ARCHIVED";
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
                <DropdownMenuItem onClick={() => onEdit(y)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
              )}
              {canSetDefault && !y.isDefault && !isArchived && (
                <DropdownMenuItem onClick={() => onSetDefault(y)}>
                  <Star className="size-4" />
                  Definir como Predefinido
                </DropdownMenuItem>
              )}
              {(canArchive || canDelete) && <DropdownMenuSeparator />}
              {canArchive && !isArchived && (
                <DropdownMenuItem
                  onClick={() => onArchive(y)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(y)}
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
