"use client";

import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { MoreHorizontal, Pencil, Archive } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  CLASSROOM_STATUS_LABELS,
  CLASSROOM_TYPE_LABELS,
  type Classroom,
} from "@/modules/classrooms/types";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  MAINTENANCE: "secondary",
  INACTIVE: "outline",
  ARCHIVED: "outline",
};

interface GetColumnsOptions {
  onArchive: (classroom: Classroom) => void;
  canEdit: boolean;
  canArchive: boolean;
}

export function getClassroomColumns({
  onArchive,
  canEdit,
  canArchive,
}: GetColumnsOptions): ColumnDef<Classroom>[] {
  return [
    {
      accessorKey: "code",
      header: "Código",
      cell: ({ row }) => (
        <Link
          href={`/classrooms/${row.original.id}`}
          className="font-mono text-sm font-medium hover:underline"
        >
          {row.original.code}
        </Link>
      ),
    },
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => (
        <Link href={`/classrooms/${row.original.id}`} className="hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: "classroomType",
      header: "Tipo",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {CLASSROOM_TYPE_LABELS[row.original.classroomType] ?? row.original.classroomType}
        </span>
      ),
    },
    {
      accessorKey: "capacity",
      header: "Capacidade",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.capacity} lugares</span>
      ),
    },
    {
      accessorKey: "branchName",
      header: "Filial",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.branchName ?? "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status] ?? "outline"}>
          {CLASSROOM_STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        if (!canEdit && !canArchive) return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/classrooms/${row.original.id}/edit`}>
                    <Pencil className="size-4 mr-2" />
                    Editar
                  </Link>
                </DropdownMenuItem>
              )}
              {canArchive && row.original.status !== "ARCHIVED" && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onArchive(row.original)}
                >
                  <Archive className="size-4 mr-2" />
                  Arquivar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
