import Link from "next/link";
import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Button } from "@/shared/components/ui/button";
import {
  SUBJECT_ATTENDANCE_VIEW_STATUS_LABELS,
  ATTENDANCE_JUSTIFICATION_STATUS_LABELS,
} from "@/modules/attendance/types";
import { Activity, ChevronLeft, ChevronRight, ClipboardList } from "lucide-react";
import type {
  SubjectAttendanceView,
  StudentAttendanceCounts,
  AttendanceJustification,
} from "@/modules/attendance/types";
import type { AttendanceRecordRow } from "@/modules/students/student-360/types";
import type { PaginatedResult } from "@/shared/types/common";

const RISK_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  NOT_STARTED: "secondary",
  OK: "secondary",
  AT_RISK: "outline",
  BELOW_REQUIRED: "destructive",
};

interface StudentAttendanceTabProps {
  // Per-subject attendance read verbatim from the persisted summary read-model
  // (source of truth). Never recomputed from raw records.
  subjects: SubjectAttendanceView[];
  // Per-status session counts from the persisted period year-rollups.
  counts: StudentAttendanceCounts;
  records: PaginatedResult<AttendanceRecordRow>;
  justifications: PaginatedResult<AttendanceJustification>;
  pendingJustificationCount: number;
}

export function StudentAttendanceTab({
  subjects,
  counts,
  records,
  justifications,
  pendingJustificationCount,
}: StudentAttendanceTabProps) {
  const totalSessions = counts.totalSessions;
  const present = counts.presentCount;
  const absent = counts.absentCount;
  const excused = counts.excusedCount;
  // Average over subjects with a persisted percentage (NOT_STARTED subjects are
  // null and excluded rather than counted as 0%).
  const percentages = subjects
    .map((s) => s.attendancePercentage)
    .filter((p): p is number => p != null);
  const avgAttendance =
    percentages.length > 0 ? percentages.reduce((sum, p) => sum + p, 0) / percentages.length : null;

  return (
    <div className="space-y-6">
      <ExecutiveKpiGrid>
        <StatCard
          title="Assiduidade Média"
          value={avgAttendance != null ? `${avgAttendance.toFixed(1)}%` : "—"}
          icon={<Activity className="size-4 text-cyan-500" />}
        />
        <StatCard title="Sessões" value={totalSessions} icon={<ClipboardList className="size-4 text-blue-500" />} />
        <StatCard title="Presenças" value={present} icon={<ClipboardList className="size-4 text-emerald-500" />} />
        <StatCard title="Faltas" value={absent} icon={<ClipboardList className="size-4 text-red-500" />} />
        <StatCard title="Justificadas" value={excused} icon={<ClipboardList className="size-4 text-violet-500" />} />
        <StatCard
          title="Justificações Pendentes"
          value={pendingJustificationCount}
          icon={<ClipboardList className="size-4 text-amber-500" />}
        />
      </ExecutiveKpiGrid>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Assiduidade por Disciplina</CardTitle>
        </CardHeader>
        <CardContent>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem registos de assiduidade.</p>
          ) : (
            <div className="space-y-2">
              {subjects.map((s) => (
                <div key={s.levelSubjectId} className="flex items-center justify-between gap-3 text-sm border-b pb-2 last:border-0">
                  <span className="truncate min-w-0 flex-1">{s.subjectName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    mín. {s.minimumAttendancePercentage != null ? `${s.minimumAttendancePercentage}%` : "—"}
                  </span>
                  <span className="font-medium tabular-nums shrink-0">
                    {s.attendancePercentage != null ? `${s.attendancePercentage.toFixed(1)}%` : "—"}
                  </span>
                  <Badge variant={RISK_VARIANT[s.status] ?? "secondary"} className="shrink-0 text-xs">
                    {SUBJECT_ATTENDANCE_VIEW_STATUS_LABELS[s.status] ?? s.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Registos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {records.data.length === 0 ? (
            <EmptyState icon={<ClipboardList className="size-8" />} title="Sem registos" description="Nenhum registo de presença encontrado." />
          ) : (
            <div className="space-y-2">
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Disciplina</th>
                      <th className="px-3 py-2">Turma</th>
                      <th className="px-3 py-2">Professor</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Notas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.data.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2">{new Date(r.sessionDate).toLocaleDateString("pt-PT")}</td>
                        <td className="px-3 py-2">{r.subjectName}</td>
                        <td className="px-3 py-2">{r.classGroupName}</td>
                        <td className="px-3 py-2">{r.teacherName ?? "—"}</td>
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {records.totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>Página {records.page} de {records.totalPages}</span>
                  <div className="flex items-center gap-1">
                    {records.hasPreviousPage ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=attendance&page=${records.page - 1}`}>
                          <ChevronLeft className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="icon" className="size-7" disabled>
                        <ChevronLeft className="size-3.5" />
                      </Button>
                    )}
                    {records.hasNextPage ? (
                      <Button asChild variant="outline" size="icon" className="size-7">
                        <Link href={`?tab=attendance&page=${records.page + 1}`}>
                          <ChevronRight className="size-3.5" />
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="icon" className="size-7" disabled>
                        <ChevronRight className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Justificações</CardTitle>
        </CardHeader>
        <CardContent>
          {justifications.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem justificações registadas.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Revisto por</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {justifications.data.map((j) => (
                    <tr key={j.id}>
                      <td className="px-3 py-2">{new Date(j.createdAt).toLocaleDateString("pt-PT")}</td>
                      <td className="px-3 py-2 max-w-xs truncate">{j.reason}</td>
                      <td className="px-3 py-2">
                        <Badge variant={j.status === "APPROVED" ? "secondary" : j.status === "REJECTED" ? "destructive" : "outline"}>
                          {ATTENDANCE_JUSTIFICATION_STATUS_LABELS[j.status] ?? j.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{j.reviewedByUserId ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
