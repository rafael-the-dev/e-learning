"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Pencil,
  ExternalLink,
  Archive,
  Trash2,
} from "lucide-react";
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
import type { ClassGroup } from "@/modules/class-groups/types";

interface GetColumnsOptions {
  onArchive: (group: ClassGroup) => void;
  onDelete: (group: ClassGroup) => void;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getClassGroupColumns({
  onArchive,
  onDelete,
  canEdit,
  canArchive,
  canDelete,
}: GetColumnsOptions): ColumnDef<ClassGroup>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => {
        const g = row.original;
        return (
          <Link href={`/class-groups/${g.id}`} className="font-medium hover:underline">
            {g.name}
          </Link>
        );
      },
    },
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ row }) => (
        <span className="text-sm font-mono text-muted-foreground">
          {row.original.code ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "courseName",
      header: "Curso",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.courseName ?? "—"}</span>
      ),
    },
    {
      accessorKey: "courseLevelName",
      header: "Nível",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.courseLevelName ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "teacherName",
      header: "Professor",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.teacherName ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "branchName",
      header: "Filial",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.branchName ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "capacity",
      header: "Capacidade",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.capacity}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "startDate",
      header: "Data de Início",
      cell: ({ row }) => {
        const d = row.original.startDate;
        return (
          <span className="text-sm text-muted-foreground">
            {d ? new Date(d).toLocaleDateString("pt-PT") : "—"}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const g = row.original;
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
              <DropdownMenuItem asChild>
                <Link href={`/class-groups/${g.id}`}>
                  <ExternalLink className="size-4" />
                  Ver detalhes
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/class-groups/${g.id}/edit`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </DropdownMenuItem>
              )}
              {canEdit && (canArchive || canDelete) && <DropdownMenuSeparator />}
              {canArchive && g.status !== "ARCHIVED" && (
                <DropdownMenuItem
                  onClick={() => onArchive(g)}
                  className="text-destructive focus:text-destructive"
                >
                  <Archive className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(g)}
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
