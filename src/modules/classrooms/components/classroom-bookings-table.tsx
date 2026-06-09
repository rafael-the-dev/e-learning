"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type PaginationState } from "@tanstack/react-table";
import { DataTable } from "@/shared/components/data/data-table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { getClassroomBookingColumns } from "./classroom-booking-columns";
import { cancelClassroomBookingAction } from "@/modules/classrooms/actions/classroom-booking.actions";
import { toast } from "@/shared/hooks/use-toast";
import { CalendarDays } from "lucide-react";
import { CLASSROOM_BOOKING_STATUS_LABELS, type ClassroomBooking } from "@/modules/classrooms/types";
import type { PaginatedResult } from "@/shared/types/common";

interface ClassroomBookingsTableProps {
  result: PaginatedResult<ClassroomBooking>;
  classrooms?: Array<{ id: string; name: string; code: string }>;
  academicYears?: Array<{ id: string; name: string }>;
  defaultClassroomId?: string;
  defaultAcademicYearId?: string;
  defaultStatus?: string;
  canCancel: boolean;
}

export function ClassroomBookingsTable({
  result,
  classrooms = [],
  academicYears = [],
  defaultClassroomId = "",
  defaultAcademicYearId = "",
  defaultStatus = "",
  canCancel,
}: ClassroomBookingsTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cancelTarget, setCancelTarget] = React.useState<ClassroomBooking | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  const pagination: PaginationState = {
    pageIndex: result.page - 1,
    pageSize: result.pageSize,
  };

  function handlePaginationChange(p: PaginationState) {
    updateParams({ page: String(p.pageIndex + 1) });
  }

  const columns = getClassroomBookingColumns({ onCancel: setCancelTarget, canCancel });

  async function handleCancel() {
    if (!cancelTarget) return;
    setIsProcessing(true);
    const res = await cancelClassroomBookingAction({ bookingId: cancelTarget.id });
    setIsProcessing(false);
    if (res.success) {
      toast.success("Reserva cancelada");
      setCancelTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {classrooms.length > 0 && (
          <Select
            value={defaultClassroomId || "all"}
            onValueChange={(v) => updateParams({ classroomId: v === "all" ? "" : v })}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sala" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as salas</SelectItem>
              {classrooms.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.code} – {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {academicYears.length > 0 && (
          <Select
            value={defaultAcademicYearId || "all"}
            onValueChange={(v) => updateParams({ yearId: v === "all" ? "" : v })}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Ano Letivo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {academicYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={defaultStatus || "all"}
          onValueChange={(v) => updateParams({ status: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            {Object.entries(CLASSROOM_BOOKING_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title="Nenhuma reserva encontrada"
          description="Ajuste os filtros ou crie a primeira reserva."
        />
      ) : (
        <DataTable
          columns={columns}
          data={result.data}
          totalRows={result.total}
          pagination={pagination}
          onPaginationChange={handlePaginationChange}
        />
      )}

      {canCancel && (
        <ConfirmDialog
          open={!!cancelTarget}
          onOpenChange={(open) => !open && setCancelTarget(null)}
          title="Cancelar Reserva"
          description="Tem a certeza que pretende cancelar esta reserva?"
          confirmLabel="Cancelar Reserva"
          variant="destructive"
          loading={isProcessing}
          onConfirm={handleCancel}
        />
      )}
    </div>
  );
}
