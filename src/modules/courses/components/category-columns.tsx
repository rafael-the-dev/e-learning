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
import type { CourseCategoryWithCount } from "@/modules/courses/types";

interface GetColumnsOptions {
  onEdit: (category: CourseCategoryWithCount) => void;
  onArchive: (category: CourseCategoryWithCount) => void;
  onDelete: (category: CourseCategoryWithCount) => void;
  canUpdate: boolean;
  canArchive: boolean;
  canDelete: boolean;
}

export function getCategoryColumns({
  onEdit,
  onArchive,
  onDelete,
  canUpdate,
  canArchive,
  canDelete,
}: GetColumnsOptions): ColumnDef<CourseCategoryWithCount>[] {
  const hasAnyAction = canUpdate || canArchive || canDelete;

  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "description",
      header: "Descrição",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground line-clamp-1">
          {row.original.description ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "coursesCount",
      header: "Cursos",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.coursesCount}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Criado a",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    ...(hasAnyAction
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }: { row: { original: CourseCategoryWithCount } }) => {
              const c = row.original;
              return (
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {canUpdate && (
                        <DropdownMenuItem onClick={() => onEdit(c)}>
                          <Pencil className="size-4" />
                          Editar
                        </DropdownMenuItem>
                      )}
                      {(canArchive || canDelete) && canUpdate && (
                        <DropdownMenuSeparator />
                      )}
                      {canArchive && c.status !== "ARCHIVED" && (
                        <DropdownMenuItem
                          onClick={() => onArchive(c)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Archive className="size-4" />
                          Arquivar
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem
                          onClick={() => onDelete(c)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          Eliminar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            },
          } as ColumnDef<CourseCategoryWithCount>,
        ]
      : []),
  ];
}
