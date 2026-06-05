"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import {
  MoreHorizontal,
  Pencil,
  ExternalLink,
  Trash2,
  CheckCircle,
  PauseCircle,
  XCircle,
  BadgeCheck,
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
import type { Enrollment } from "@/modules/enrollments/types";

interface GetColumnsOptions {
  onActivate: (enrollment: Enrollment) => void;
  onSuspend: (enrollment: Enrollment) => void;
  onCancel: (enrollment: Enrollment) => void;
  onComplete: (enrollment: Enrollment) => void;
  onDelete: (enrollment: Enrollment) => void;
  canEdit: boolean;
  canActivate: boolean;
  canSuspend: boolean;
  canCancel: boolean;
  canComplete: boolean;
  canDelete: boolean;
}

export function getEnrollmentColumns({
  onActivate,
  onSuspend,
  onCancel,
  onComplete,
  onDelete,
  canEdit,
  canActivate,
  canSuspend,
  canCancel,
  canComplete,
  canDelete,
}: GetColumnsOptions): ColumnDef<Enrollment>[] {
  return [
    {
      accessorKey: "enrollmentNumber",
      header: "N.º Matrícula",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium">
          {row.original.enrollmentNumber ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "studentName",
      header: "Aluno",
      cell: ({ row }) => {
        const e = row.original;
        return (
          <Link href={`/enrollments/${e.id}`} className="font-medium hover:underline">
            {e.studentName ?? "—"}
          </Link>
        );
      },
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
      accessorKey: "classGroupName",
      header: "Turma",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.classGroupName ?? "—"}
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
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "enrollmentDate",
      header: "Data de Matrícula",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.enrollmentDate).toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const e = row.original;
        const canActivateThis = canActivate && ["DRAFT", "PENDING_PAYMENT", "SUSPENDED"].includes(e.status);
        const canSuspendThis = canSuspend && e.status === "ACTIVE";
        const canCancelThis = canCancel && ["DRAFT", "PENDING_PAYMENT", "ACTIVE"].includes(e.status);
        const canCompleteThis = canComplete && e.status === "ACTIVE";
        const showStatusSep = canEdit && (canActivateThis || canSuspendThis || canCancelThis || canCompleteThis || canDelete);
        const showDestructiveSep = (canActivateThis || canSuspendThis || canCancelThis || canCompleteThis) && (canCancelThis || canCompleteThis || canDelete);

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
                <Link href={`/enrollments/${e.id}`}>
                  <ExternalLink className="size-4" />
                  Ver detalhes
                </Link>
              </DropdownMenuItem>
              {canEdit && !["COMPLETED", "CANCELLED"].includes(e.status) && (
                <DropdownMenuItem asChild>
                  <Link href={`/enrollments/${e.id}/edit`}>
                    <Pencil className="size-4" />
                    Editar
                  </Link>
                </DropdownMenuItem>
              )}
              {showStatusSep && <DropdownMenuSeparator />}
              {canActivateThis && (
                <DropdownMenuItem onClick={() => onActivate(e)}>
                  <CheckCircle className="size-4" />
                  Ativar
                </DropdownMenuItem>
              )}
              {canSuspendThis && (
                <DropdownMenuItem
                  onClick={() => onSuspend(e)}
                  className="text-amber-600 focus:text-amber-600"
                >
                  <PauseCircle className="size-4" />
                  Suspender
                </DropdownMenuItem>
              )}
              {showDestructiveSep && <DropdownMenuSeparator />}
              {canCompleteThis && (
                <DropdownMenuItem onClick={() => onComplete(e)}>
                  <BadgeCheck className="size-4" />
                  Concluir
                </DropdownMenuItem>
              )}
              {canCancelThis && (
                <DropdownMenuItem
                  onClick={() => onCancel(e)}
                  className="text-destructive focus:text-destructive"
                >
                  <XCircle className="size-4" />
                  Cancelar
                </DropdownMenuItem>
              )}
              {canDelete && ["DRAFT", "CANCELLED", "PENDING_PAYMENT"].includes(e.status) && (
                <DropdownMenuItem
                  onClick={() => onDelete(e)}
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
