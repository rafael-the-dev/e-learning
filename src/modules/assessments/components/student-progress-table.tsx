"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/shared/hooks/use-toast";
import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
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
import { PaginationControls } from "@/shared/components/layout/pagination-controls";
import { STUDENT_SUBJECT_PROGRESS_STATUS_LABELS } from "@/modules/assessments/types";
import { recalculateStudentSubjectProgressAction } from "@/modules/assessments/actions/assessment.actions";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import type { PaginatedResult } from "@/shared/types/common";

interface Props {
  result: PaginatedResult<StudentSubjectProgress>;
  defaultSearch?: string;
  defaultStatus?: string;
  canRecalculate: boolean;
}

const statusVariant = (s: string): "default" | "secondary" | "outline" | "destructive" => {
  if (s === "PASSED") return "default";
  if (s === "FAILED") return "destructive";
  if (s === "IN_PROGRESS") return "secondary";
  return "outline";
};

export function StudentProgressTable({ result, defaultSearch, defaultStatus, canRecalculate }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [status, setStatus] = useState(defaultStatus ?? "");
  const [recalculating, setRecalculating] = useState<string | null>(null);

  function applyFilters(s: string, st: string) {
    const params = new URLSearchParams();
    if (s) params.set("search", s);
    if (st) params.set("status", st);
    router.push(`?${params.toString()}`);
  }

  async function handleRecalculate(progress: StudentSubjectProgress) {
    setRecalculating(progress.id);
    const res = await recalculateStudentSubjectProgressAction({
      studentId: progress.studentId,
      enrollmentId: progress.enrollmentId,
      levelSubjectId: progress.levelSubjectId,
    });
    setRecalculating(null);
    if (res.success) {
      toast.success("Progresso recalculado.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao recalcular.");
    }
  }

  const statusOptions = Object.entries(STUDENT_SUBJECT_PROGRESS_STATUS_LABELS);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Pesquisar aluno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters(search, status)}
          className="max-w-sm"
        />
        <Select
          value={status || "ALL"}
          onValueChange={(v) => {
            const s = v === "ALL" ? "" : v;
            setStatus(s);
            applyFilters(search, s);
          }}
        >
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {statusOptions.map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => applyFilters(search, status)}>
          Filtrar
        </Button>
      </div>

      {result.data.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-muted-foreground">
          Nenhum progresso encontrado.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead>Disciplina</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Nota Final</TableHead>
                <TableHead>Presenças</TableHead>
                <TableHead>Estado</TableHead>
                {canRecalculate && <TableHead className="w-25" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.studentName ?? p.studentId}</TableCell>
                  <TableCell>{p.subjectName ?? "—"}</TableCell>
                  <TableCell>{p.courseLevelName ?? "—"}</TableCell>
                  <TableCell>
                    {p.finalGrade != null ? Number(p.finalGrade).toFixed(1) : "—"}
                  </TableCell>
                  <TableCell>
                    {p.attendancePercentage != null
                      ? `${Number(p.attendancePercentage).toFixed(0)}%`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(p.status)}>
                      {STUDENT_SUBJECT_PROGRESS_STATUS_LABELS[p.status] ?? p.status}
                    </Badge>
                  </TableCell>
                  {canRecalculate && (
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8"
                        disabled={recalculating === p.id}
                        onClick={() => handleRecalculate(p)}
                        title="Recalcular"
                      >
                        <RefreshCw
                          className={`size-4 ${recalculating === p.id ? "animate-spin" : ""}`}
                        />
                      </Button>
                    </TableCell>
                  )}
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
