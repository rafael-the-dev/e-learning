import { StatCard } from "@/shared/components/layout/stat-card";
import { ExecutiveKpiGrid } from "@/shared/components/layout/executive-dashboard";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { AccessiblePagination } from "@/shared/components/data/accessible-pagination";
import {
  SUBJECT_ATTENDANCE_VIEW_STATUS_LABELS,
  ATTENDANCE_JUSTIFICATION_STATUS_LABELS,
} from "@/modules/attendance/types";
import { Activity, ClipboardList } from "lucide-react";
import type {
  SubjectAttendanceView,
  StudentAttendanceSummary,
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
  // Canonical attendance read model (H5) — overall percentage + per-status counts.
  summary: StudentAttendanceSummary;
  records: PaginatedResult<AttendanceRecordRow>;
  justifications: PaginatedResult<AttendanceJustification>;
  pendingJustificationCount: number;
}

export function StudentAttendanceTab({
  subjects,
  summary,
  records,
  justifications,
  pendingJustificationCount,
}: StudentAttendanceTabProps) {
  const totalSessions = summary.totalSessions;
  const present = summary.presentCount;
  const absent = summary.absentCount;
  const excused = summary.excusedCount;
  // Canonical overall attendance % (H5) — the same value shown across every surface.
  const avgAttendance = summary.attendancePercentage;

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
              <div id="student-attendance-records-table" className="rounded-md border overflow-x-auto">
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
              <AccessiblePagination
                navLabel="Paginação da assiduidade"
                previousLabel="Ir para a página anterior da assiduidade"
                nextLabel="Ir para a página seguinte da assiduidade"
                page={records.page}
                pageSize={records.pageSize}
                totalPages={records.totalPages}
                totalItems={records.total}
                itemsLabel="registos de assiduidade"
                sectionLabel="da assiduidade"
                hasPreviousPage={records.hasPreviousPage}
                hasNextPage={records.hasNextPage}
                hrefForPage={(p) => `?tab=attendance&page=${p}`}
                controlsId="student-attendance-records-table"
              />
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
