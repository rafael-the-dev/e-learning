"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "@/shared/hooks/use-toast";
import { bulkMarkAttendanceAction } from "@/modules/attendance/actions/attendance.actions";
import { ATTENDANCE_RECORD_STATUS_LABELS, ATTENDANCE_RECORD_STATUS_COLORS } from "@/modules/attendance/types";
import { cn } from "@/shared/lib/utils";
import type { AttendanceRecord } from "@/modules/attendance/types";

interface StudentEntry {
  studentId: string;
  enrollmentId: string;
  firstName: string;
  lastName: string;
  code: string | null;
}

interface MarkAttendanceFormProps {
  sessionId: string;
  sessionDurationMinutes: number;
  students: StudentEntry[];
  existingRecords: AttendanceRecord[];
}

type RecordStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "REMOTE";

interface StudentRow {
  studentId: string;
  firstName: string;
  lastName: string;
  code: string | null;
  status: RecordStatus;
  lateMinutes: number;
  notes: string;
}

function initRows(students: StudentEntry[], existingRecords: AttendanceRecord[]): StudentRow[] {
  const existing = new Map(existingRecords.map((r) => [r.studentId, r]));
  return students.map((s) => {
    const rec = existing.get(s.studentId);
    return {
      studentId: s.studentId,
      firstName: s.firstName,
      lastName: s.lastName,
      code: s.code,
      status: (rec?.status as RecordStatus) ?? "ABSENT",
      lateMinutes: rec?.lateMinutes ?? 0,
      notes: rec?.notes ?? "",
    };
  });
}

const STATUS_OPTIONS: RecordStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "REMOTE"];

export function MarkAttendanceForm({
  sessionId,
  sessionDurationMinutes,
  students,
  existingRecords,
}: MarkAttendanceFormProps) {
  const router = useRouter();
  const [rows, setRows] = React.useState<StudentRow[]>(() =>
    initRows(students, existingRecords)
  );
  const [loading, setLoading] = React.useState(false);
  const [bulkStatus, setBulkStatus] = React.useState<RecordStatus | "">("");

  function updateRow(studentId: string, patch: Partial<StudentRow>) {
    setRows((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r))
    );
  }

  function applyBulkStatus() {
    if (!bulkStatus) return;
    setRows((prev) => prev.map((r) => ({ ...r, status: bulkStatus, lateMinutes: 0 })));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await bulkMarkAttendanceAction({
      sessionId,
      records: rows.map((r) => ({
        studentId: r.studentId,
        // enrollmentId is intentionally NOT sent — the server resolves it from
        // (studentId, session class group, org). See BulkMarkAttendanceCommand.
        status: r.status,
        lateMinutes: r.status === "LATE" ? r.lateMinutes : undefined,
        notes: r.notes || undefined,
      })),
    });
    setLoading(false);
    if (res.success) {
      toast({ title: "Presenças guardadas com sucesso" });
      router.push(`/attendance/sessions/${sessionId}`);
    } else {
      toast({ title: "Erro ao guardar presenças", description: res.error, variant: "destructive" });
    }
  }

  const summary = React.useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    });
    return counts;
  }, [rows]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <span
            key={s}
            className={cn("inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium", ATTENDANCE_RECORD_STATUS_COLORS[s])}
          >
            {ATTENDANCE_RECORD_STATUS_LABELS[s]}: {summary[s] ?? 0}
          </span>
        ))}
      </div>

      {/* Bulk action */}
      <div className="flex items-center gap-3 pb-2 border-b">
        <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as RecordStatus)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Marcar todos como..." />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {ATTENDANCE_RECORD_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={applyBulkStatus} disabled={!bulkStatus}>
          Aplicar a todos
        </Button>
      </div>

      {/* Student rows */}
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.studentId}
            className="grid grid-cols-12 items-center gap-3 rounded-lg border px-4 py-3 bg-card"
          >
            <div className="col-span-4 sm:col-span-3">
              <p className="text-sm font-medium leading-tight">
                {row.firstName} {row.lastName}
              </p>
              {row.code && (
                <p className="text-xs text-muted-foreground font-mono">{row.code}</p>
              )}
            </div>
            <div className="col-span-4 sm:col-span-3">
              <Select
                value={row.status}
                onValueChange={(v) =>
                  updateRow(row.studentId, { status: v as RecordStatus, lateMinutes: 0 })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ATTENDANCE_RECORD_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {row.status === "LATE" && (
              <div className="col-span-3 sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  max={sessionDurationMinutes}
                  value={row.lateMinutes}
                  onChange={(e) =>
                    updateRow(row.studentId, { lateMinutes: parseInt(e.target.value) || 0 })
                  }
                  placeholder="min. atraso"
                  className="h-8 text-sm"
                />
              </div>
            )}
            <div className={cn(
              "col-span-12 sm:col-span-4",
              row.status === "LATE" ? "sm:col-span-4" : "sm:col-span-6"
            )}>
              <Input
                value={row.notes}
                onChange={(e) => updateRow(row.studentId, { notes: e.target.value })}
                placeholder="Notas..."
                className="h-8 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "A guardar..." : "Guardar Presenças"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/attendance/sessions/${sessionId}`)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
