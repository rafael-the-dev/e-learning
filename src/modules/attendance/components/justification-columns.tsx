"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, XCircle } from "lucide-react";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Button } from "@/shared/components/ui/button";
import type { AttendanceJustification } from "@/modules/attendance/types";

interface GetJustificationColumnsOptions {
  onApprove: (j: AttendanceJustification) => void;
  onReject: (j: AttendanceJustification) => void;
  canApprove: boolean;
  canReject: boolean;
}

export function getJustificationColumns({
  onApprove,
  onReject,
  canApprove,
  canReject,
}: GetJustificationColumnsOptions): ColumnDef<AttendanceJustification>[] {
  return [
    {
      id: "student",
      header: "Aluno",
      cell: ({ row }) => {
        const s = row.original.student;
        return (
          <span className="text-sm font-medium">
            {s ? `${s.firstName} ${s.lastName}` : "—"}
          </span>
        );
      },
    },
    {
      id: "session",
      header: "Sessão",
      cell: ({ row }) => {
        const rec = row.original.attendanceRecord;
        if (!rec) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <div className="text-sm">
            <div>{rec.attendanceSession.subject.name}</div>
            <div className="text-muted-foreground text-xs">
              {new Date(rec.attendanceSession.sessionDate).toLocaleDateString("pt-PT")} ·{" "}
              {rec.attendanceSession.classGroup.name}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "reason",
      header: "Motivo",
      cell: ({ row }) => (
        <span className="text-sm line-clamp-2 max-w-xs">{row.original.reason}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "createdAt",
      header: "Submetido",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("pt-PT")}
        </span>
      ),
    },
    {
      id: "reviewedAt",
      header: "Revisto",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.reviewedAt
            ? new Date(row.original.reviewedAt).toLocaleDateString("pt-PT")
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const j = row.original;
        if (j.status !== "PENDING") return null;
        return (
          <div className="flex gap-2">
            {canApprove && (
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                onClick={() => onApprove(j)}
              >
                <CheckCircle2 className="size-3.5 mr-1" />
                Aprovar
              </Button>
            )}
            {canReject && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => onReject(j)}
              >
                <XCircle className="size-3.5 mr-1" />
                Rejeitar
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}
