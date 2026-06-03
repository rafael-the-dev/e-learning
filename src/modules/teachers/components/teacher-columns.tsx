"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Pencil,
  ExternalLink,
  PauseCircle,
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
import type { Teacher } from "@/modules/teachers/types";

interface GetColumnsOptions {
  onSuspend: (teacher: Teacher) => void;
  onDelete: (teacher: Teacher) => void;
}

export function getTeacherColumns({
  onSuspend,
  onDelete,
}: GetColumnsOptions): ColumnDef<Teacher>[] {
  return [
    {
      id: "fullName",
      header: "Nome Completo",
      cell: ({ row }) => {
        const t = row.original;
        return (
          <Link
            href={`/teachers/${t.id}`}
            className="font-medium hover:underline"
          >
            {t.fullName}
          </Link>
        );
      },
    },
    {
      accessorKey: "phone",
      header: "Telefone",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.phone ?? "—"}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "E-mail",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.email ?? "—"}
        </span>
      ),
    },
    {
      id: "branch",
      header: "Filial",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.branch?.name ?? "—"}</span>
      ),
    },
    {
      accessorKey: "specialization",
      header: "Especialização",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.specialization ?? "—"}
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
      header: "Registado a",
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
        const t = row.original;
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
                  <Link href={`/teachers/${t.id}`}>
                    <ExternalLink className="size-4" />
                    Ver Detalhes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/teachers/${t.id}/edit`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {t.status !== "SUSPENDED" && (
                  <DropdownMenuItem
                    onClick={() => onSuspend(t)}
                    className="text-destructive focus:text-destructive"
                  >
                    <PauseCircle className="size-4" />
                    Suspender
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onDelete(t)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Arquivar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
