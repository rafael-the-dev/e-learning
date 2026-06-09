"use client";

import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, CheckCircle2, XCircle, Eye, ClipboardList } from "lucide-react";
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
import type { AttendanceSession } from "@/modules/attendance/types";

interface GetSessionColumnsOptions {
  onComplete: (session: AttendanceSession) => void;
  onCancel: (session: AttendanceSession) => void;
  canComplete: boolean;
  canCancel: boolean;
}

export function getSessionColumns({
  onComplete,
  onCancel,
  canComplete,
  canCancel,
}: GetSessionColumnsOptions): ColumnDef<AttendanceSession>[] {
  return [
    {
      accessorKey: "sessionDate",
      header: "Data",
      cell: ({ row }) => (
        <span className="text-sm">
          {new Date(row.original.sessionDate).toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    {
      id: "time",
      header: "Horário",
      cell: ({ row }) => (
        <span className="text-sm font-mono">
          {row.original.startTime} – {row.original.endTime}
        </span>
      ),
    },
    {
      id: "classGroup",
      header: "Turma",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.classGroup?.name ?? "—"}</span>
      ),
    },
    {
      id: "subject",
      header: "Disciplina",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.subject?.name ?? "—"}</span>
      ),
    },
    {
      id: "teacher",
      header: "Professor",
      cell: ({ row }) => {
        const t = row.original.teacher;
        return (
          <span className="text-sm">
            {t ? `${t.firstName} ${t.lastName}` : "—"}
          </span>
        );
      },
    },
    {
      accessorKey: "durationMinutes",
      header: "Duração",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.durationMinutes} min
        </span>
      ),
    },
    {
      id: "records",
      header: "Presenças",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original._count?.records ?? 0}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const session = row.original;
        const isTerminal = session.status === "COMPLETED" || session.status === "CANCELLED";
        return (
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
                <Link href={`/attendance/sessions/${session.id}`}>
                  <Eye className="size-4 mr-2" />
                  Ver Detalhes
                </Link>
              </DropdownMenuItem>
              {!isTerminal && (
                <DropdownMenuItem asChild>
                  <Link href={`/attendance/sessions/${session.id}/mark`}>
                    <ClipboardList className="size-4 mr-2" />
                    Marcar Presenças
                  </Link>
                </DropdownMenuItem>
              )}
              {canComplete && !isTerminal && (
                <DropdownMenuItem onClick={() => onComplete(session)}>
                  <CheckCircle2 className="size-4 mr-2" />
                  Concluir Sessão
                </DropdownMenuItem>
              )}
              {canCancel && !isTerminal && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onCancel(session)}
                  >
                    <XCircle className="size-4 mr-2" />
                    Cancelar Sessão
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
