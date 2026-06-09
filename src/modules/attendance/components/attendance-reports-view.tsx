"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { BarChart3 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { StudentSubjectAttendance } from "@/modules/attendance/types";

interface ClassGroupOption {
  id: string;
  name: string;
  courseLevelId: string | null;
  academicYearId: string;
  academicTermId: string | null;
}

interface AcademicYearOption {
  id: string;
  name: string;
}

interface AttendanceReportsViewProps {
  organizationId: string;
  classGroups: ClassGroupOption[];
  academicYears: AcademicYearOption[];
  defaultClassGroupId?: string;
  defaultAcademicYearId?: string;
}

type ReportEntry = {
  studentId: string;
  studentName: string;
  studentCode: string | null;
  subjects: StudentSubjectAttendance[];
};

const RISK_COLORS: Record<string, string> = {
  OK: "text-emerald-600",
  AT_RISK: "text-amber-600",
  BELOW_REQUIRED: "text-red-600",
};

const RISK_LABELS: Record<string, string> = {
  OK: "OK",
  AT_RISK: "Em Risco",
  BELOW_REQUIRED: "Abaixo do Mínimo",
};

const ALL = "__all__";

export function AttendanceReportsView({
  organizationId,
  classGroups,
  academicYears,
  defaultClassGroupId,
  defaultAcademicYearId,
}: AttendanceReportsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [classGroupId, setClassGroupId] = React.useState(defaultClassGroupId ?? ALL);
  const [academicYearId, setAcademicYearId] = React.useState(defaultAcademicYearId ?? ALL);
  const [report, setReport] = React.useState<ReportEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  function push(overrides: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(overrides).forEach(([k, v]) => {
      if (v && v !== ALL) params.set(k, v);
      else params.delete(k);
    });
    router.push(`?${params.toString()}`);
  }

  React.useEffect(() => {
    if (classGroupId && classGroupId !== ALL) {
      loadReport(classGroupId);
    } else {
      setReport([]);
    }
  }, [classGroupId]);

  async function loadReport(cgId: string) {
    setLoading(true);
    setReport([]);
    try {
      const res = await fetch(
        `/api/attendance/reports?classGroupId=${cgId}&organizationId=${organizationId}`
      );
      if (res.ok) {
        const data = await res.json();
        setReport(data);
      }
    } catch {
      // silently ignore — user will see empty state
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Select
          value={academicYearId}
          onValueChange={(v) => {
            setAcademicYearId(v);
            push({ academicYearId: v });
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Ano letivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os anos</SelectItem>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={classGroupId}
          onValueChange={(v) => {
            setClassGroupId(v);
            push({ classGroupId: v });
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Selecionar turma..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Selecionar turma...</SelectItem>
            {classGroups
              .filter(
                (g) =>
                  academicYearId === ALL || g.academicYearId === academicYearId
              )
              .map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {classGroupId === ALL ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="Selecionar uma turma"
          description="Escolha uma turma acima para ver o relatório de presenças."
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">A carregar relatório...</p>
        </div>
      ) : report.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title="Sem dados de presença"
          description="Nenhuma sessão concluída encontrada para esta turma."
        />
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Aluno</th>
                {report[0]?.subjects.map((s) => (
                  <th
                    key={s.levelSubjectId}
                    className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {s.subjectName}
                    {s.minimumAttendancePercentage != null && (
                      <span className="block text-xs font-normal">
                        mín. {s.minimumAttendancePercentage}%
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.map((entry) => (
                <tr key={entry.studentId} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{entry.studentName}</p>
                    {entry.studentCode && (
                      <p className="text-xs text-muted-foreground font-mono">{entry.studentCode}</p>
                    )}
                  </td>
                  {entry.subjects.map((s) => (
                    <td key={s.levelSubjectId} className="px-4 py-3">
                      <span
                        className={cn(
                          "font-semibold",
                          RISK_COLORS[s.status] ?? "text-foreground"
                        )}
                      >
                        {s.attendancePercentage.toFixed(1)}%
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {RISK_LABELS[s.status]}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
