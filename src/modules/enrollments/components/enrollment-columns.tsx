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
import { cn } from "@/shared/lib/utils";
import type { Enrollment } from "@/modules/enrollments/types";

const FINANCIAL_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NO_INVOICE: { label: "Sem Fatura", className: "bg-slate-100 text-slate-600 border-slate-200" },
  PENDING: { label: "Pendente", className: "bg-amber-50 text-amber-700 border-amber-200" },
  PARTIALLY_PAID: { label: "Parcial", className: "bg-blue-50 text-blue-700 border-blue-200" },
  PAID: { label: "Pago", className: "bg-green-50 text-green-700 border-green-200" },
  OVERDUE: { label: "Vencido", className: "bg-red-50 text-red-700 border-red-200" },
  CANCELLED: { label: "Cancelado", className: "bg-slate-100 text-slate-500 border-slate-200" },
};

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
      accessorKey: "financialStatus",
      header: "Est. Financeiro",
      cell: ({ row }) => {
        const fs = row.original.financialStatus;
        if (!fs) return <span className="text-xs text-muted-foreground">—</span>;
        const cfg = FINANCIAL_STATUS_CONFIG[fs];
        if (!cfg) return <span className="text-xs text-muted-foreground">{fs}</span>;
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
              cfg.className
            )}
          >
            {cfg.label}
          </span>
        );
      },
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
