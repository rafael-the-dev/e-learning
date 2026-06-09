"use client";

import { type ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { MoreHorizontal, XCircle } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { CLASSROOM_BOOKING_STATUS_LABELS, type ClassroomBooking } from "@/modules/classrooms/types";

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Segunda",
  TUESDAY: "Terça",
  WEDNESDAY: "Quarta",
  THURSDAY: "Quinta",
  FRIDAY: "Sexta",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  COMPLETED: "secondary",
  CANCELLED: "outline",
  ARCHIVED: "outline",
};

interface GetBookingColumnsOptions {
  onCancel: (booking: ClassroomBooking) => void;
  canCancel: boolean;
}

export function getClassroomBookingColumns({
  onCancel,
  canCancel,
}: GetBookingColumnsOptions): ColumnDef<ClassroomBooking>[] {
  return [
    {
      accessorKey: "classroomCode",
      header: "Sala",
      cell: ({ row }) => (
        <div>
          <Link href={`/classrooms/${row.original.classroomId}`} className="font-mono text-sm font-medium hover:underline">
            {row.original.classroomCode}
          </Link>
          <p className="text-xs text-muted-foreground">{row.original.classroomName}</p>
        </div>
      ),
    },
    {
      accessorKey: "classGroupName",
      header: "Turma",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.classGroupName ?? "—"}</span>
      ),
    },
    {
      id: "schedule",
      header: "Horário",
      cell: ({ row }) => {
        const b = row.original;
        if (b.scheduleSlotDay && b.scheduleSlotStart && b.scheduleSlotEnd) {
          return (
            <span className="text-sm text-muted-foreground">
              {DAY_LABELS[b.scheduleSlotDay] ?? b.scheduleSlotDay} {b.scheduleSlotStart}–{b.scheduleSlotEnd}
            </span>
          );
        }
        return (
          <span className="text-sm text-muted-foreground">
            {new Date(b.startDate).toLocaleDateString("pt-PT")} → {new Date(b.endDate).toLocaleDateString("pt-PT")}
          </span>
        );
      },
    },
    {
      accessorKey: "academicYearName",
      header: "Ano Letivo",
      cell: ({ row }) => (
        <div>
          <p className="text-sm">{row.original.academicYearName}</p>
          {row.original.academicTermName && (
            <p className="text-xs text-muted-foreground">{row.original.academicTermName}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANTS[row.original.status] ?? "outline"}>
          {CLASSROOM_BOOKING_STATUS_LABELS[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        if (!canCancel || row.original.status === "CANCELLED") return null;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canCancel && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onCancel(row.original)}
                >
                  <XCircle className="size-4 mr-2" />
                  Cancelar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
