"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/shared/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Badge } from "@/shared/components/ui/badge";
import { PaginationControls } from "@/shared/components/layout/pagination-controls";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { GraduationCap } from "lucide-react";
import type { ProgressDashboardRow, CourseFilterItem } from "@/modules/grades/services/progress-dashboard-metrics.service";
import type { PaginatedResult } from "@/shared/types/common";

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Não Iniciado",
  IN_PROGRESS: "Em Progresso",
  PASSED: "Aprovado",
  COMPLETED: "Concluído",
  FAILED: "Reprovado",
  RECOVERY_REQUIRED: "Em Recuperação",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  NOT_STARTED: "secondary",
  IN_PROGRESS: "default",
  PASSED: "default",
  COMPLETED: "default",
  FAILED: "destructive",
  RECOVERY_REQUIRED: "outline",
};

const STATUS_CLASS: Record<string, string> = {
  PASSED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-100 text-red-700 border-red-200",
  RECOVERY_REQUIRED: "bg-orange-100 text-orange-700 border-orange-200",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700 border-indigo-200",
  NOT_STARTED: "bg-slate-100 text-slate-600 border-slate-200",
};

interface Props {
  result: PaginatedResult<ProgressDashboardRow>;
  courses: CourseFilterItem[];
  defaultSearch?: string;
  defaultStatus?: string;
  defaultCourseId?: string;
}

export function StudentProgressDashboardTable({
  result,
  courses,
  defaultSearch,
  defaultStatus,
  defaultCourseId,
}: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");

  function applyFilters(updates: Record<string, string>) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (defaultStatus) params.set("status", defaultStatus);
    if (defaultCourseId) params.set("courseId", defaultCourseId);
    Object.entries(updates).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2 pb-3">
        <Input
          placeholder="Pesquisar por nome do aluno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters({ search })}
          className="max-w-xs h-8 text-sm"
        />
        <Select
          value={defaultStatus || "ALL"}
          onValueChange={(v) => applyFilters({ status: v === "ALL" ? "" : v })}
        >
          <SelectTrigger className="w-44 h-8 text-sm">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os estados</SelectItem>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {courses.length > 0 && (
          <Select
            value={defaultCourseId || "ALL"}
            onValueChange={(v) => applyFilters({ courseId: v === "ALL" ? "" : v })}
          >
            <SelectTrigger className="w-48 h-8 text-sm">
              <SelectValue placeholder="Curso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os cursos</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-8" />}
          title="Nenhum registo encontrado"
          description="Ajuste os filtros para ver o progresso dos alunos."
        />
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead>Curso</TableHead>
                <TableHead>Nível Atual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Nota Final</TableHead>
                <TableHead className="text-center">Créditos</TableHead>
                <TableHead>Atualizado Em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <Link
                        href={`/enrollments/${row.enrollmentId}`}
                        className="text-sm font-medium hover:underline truncate"
                      >
                        {row.studentName}
                      </Link>
                      <div className="flex flex-wrap gap-1">
                        {row.isBlocked && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                            Bloqueado
                          </span>
                        )}
                        {row.isEligible && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                            Elegível
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.courseName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.currentLevelName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_CLASS[row.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`text-xs font-mono tabular-nums font-medium ${
                        row.finalGrade
                          ? row.status === "FAILED"
                            ? "text-red-600"
                            : "text-emerald-600"
                          : "text-muted-foreground"
                      }`}
                    >
                      {row.finalGrade ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-xs font-mono tabular-nums">{row.earnedCredits}</span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(row.updatedAt).toLocaleDateString("pt-PT")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PaginationControls meta={result} />
    </>
  );
}
