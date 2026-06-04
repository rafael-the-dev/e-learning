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
import { COURSE_CATEGORY_LABELS } from "@/modules/courses/types";
import type { Course } from "@/modules/courses/types";

interface GetColumnsOptions {
  onArchive: (course: Course) => void;
  onDelete: (course: Course) => void;
}

export function getCourseColumns({
  onArchive,
  onDelete,
}: GetColumnsOptions): ColumnDef<Course>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => {
        const c = row.original;
        return (
          <Link
            href={`/courses/${c.id}`}
            className="font-medium hover:underline"
          >
            {c.name}
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
      accessorKey: "category",
      header: "Categoria",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.category
            ? (COURSE_CATEGORY_LABELS[row.original.category] ?? row.original.category)
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "totalHours",
      header: "Carga Horária",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.totalHours ? `${row.original.totalHours}h` : "—"}
        </span>
      ),
    },
    {
      accessorKey: "price",
      header: "Preço",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.price
            ? parseFloat(row.original.price).toLocaleString("pt-PT", {
                style: "currency",
                currency: "MZN",
              })
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
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
                <DropdownMenuItem asChild>
                  <Link href={`/courses/${c.id}`}>
                    <ExternalLink className="size-4" />
                    Ver Detalhes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/courses/${c.id}/edit`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {c.status !== "ARCHIVED" && (
                  <DropdownMenuItem
                    onClick={() => onArchive(c)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="size-4" />
                    Arquivar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onDelete(c)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
