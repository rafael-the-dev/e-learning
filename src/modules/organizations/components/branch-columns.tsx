"use client";

import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, Trash2, Star } from "lucide-react";
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
import type { Branch } from "@prisma/client";

interface GetBranchColumnsOptions {
  onEdit: (branch: Branch) => void;
  onDelete: (branch: Branch) => void;
}

export function getBranchColumns({
  onEdit,
  onDelete,
}: GetBranchColumnsOptions): ColumnDef<Branch>[] {
  return [
    {
      accessorKey: "name",
      header: "Filial",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div>
            <p className="font-medium">{row.original.name}</p>
            {row.original.code && (
              <p className="text-xs text-muted-foreground">{row.original.code}</p>
            )}
          </div>
          {row.original.isDefault && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Star className="size-3" />
              Principal
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "email",
      header: "E-mail",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.email ?? "—"}</span>
      ),
    },
    {
      accessorKey: "phone",
      header: "Telefone",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.phone ?? "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const branch = row.original;
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
                <DropdownMenuItem onClick={() => onEdit(branch)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
                {!branch.isDefault && (
                  <DropdownMenuItem
                    onClick={() => onDelete(branch)}
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
    },
  ];
}
