"use client";

import * as React from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Pencil, PauseCircle, ExternalLink } from "lucide-react";
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
import type { Organization } from "@prisma/client";

interface GetColumnsOptions {
  onEdit: (org: Organization) => void;
  onSuspend: (org: Organization) => void;
}

export function getOrganizationColumns({
  onEdit,
  onSuspend,
}: GetColumnsOptions): ColumnDef<Organization>[] {
  return [
    {
      accessorKey: "name",
      header: "Organização",
      cell: ({ row }) => (
        <div>
          <Link
            href={`/organizations/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
          <p className="text-xs text-muted-foreground mt-0.5">{row.original.slug}</p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "plan",
      header: "Plano",
      cell: ({ row }) => (
        <span className="text-sm capitalize">{row.original.plan.toLowerCase()}</span>
      ),
    },
    {
      accessorKey: "email",
      header: "E-mail",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{row.original.email ?? "—"}</span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Criado",
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
        const org = row.original;
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
                  <Link href={`/organizations/${org.id}`}>
                    <ExternalLink className="size-4" />
                    Ver Detalhes
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(org)}>
                  <Pencil className="size-4" />
                  Editar
                </DropdownMenuItem>
                {org.status !== "SUSPENDED" && org.status !== "CANCELLED" && (
                  <DropdownMenuItem
                    onClick={() => onSuspend(org)}
                    className="text-destructive focus:text-destructive"
                  >
                    <PauseCircle className="size-4" />
                    Suspender
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
