"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Pencil,
  ExternalLink,
  UserX,
  UserCheck,
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
import { ROLE_LABELS } from "@/modules/users/types";
import type { OrgUser } from "@/modules/users/types";

interface GetColumnsOptions {
  onDisable: (user: OrgUser) => void;
  onEnable: (user: OrgUser) => void;
  onRemove: (user: OrgUser) => void;
}

export function getUserColumns({
  onDisable,
  onEnable,
  onRemove,
}: GetColumnsOptions): ColumnDef<OrgUser>[] {
  return [
    {
      accessorKey: "name",
      header: "Nome",
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div>
            <Link
              href={`/users/${u.id}`}
              className="font-medium hover:underline"
            >
              {u.name}
            </Link>
            <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
          </div>
        );
      },
    },
    {
      id: "role",
      header: "Papel",
      cell: ({ row }) => {
        const role = row.original.roles[0];
        return (
          <span className="text-sm">
            {role ? (ROLE_LABELS[role.name] ?? role.name) : "—"}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Estado",
      cell: ({ row }) => (
        <StatusBadge status={row.original.isActive ? "ACTIVE" : "DISABLED"} />
      ),
    },
    {
      accessorKey: "joinedAt",
      header: "Adicionado",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.joinedAt).toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const u = row.original;
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
                  <Link href={`/users/${u.id}`}>
                    <ExternalLink className="size-4" />
                    Ver Detalhes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/users/${u.id}/edit`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {u.isActive ? (
                  <DropdownMenuItem
                    onClick={() => onDisable(u)}
                    className="text-destructive focus:text-destructive"
                  >
                    <UserX className="size-4" />
                    Desativar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onEnable(u)}>
                    <UserCheck className="size-4" />
                    Ativar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => onRemove(u)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="size-4" />
                  Remover da Organização
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];
}
