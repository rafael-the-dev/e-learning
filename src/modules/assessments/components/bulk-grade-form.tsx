"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { bulkGradeAssessmentAction } from "@/modules/assessments/actions/assessment.actions";
import type { Assessment } from "@/modules/assessments/types";

interface StudentRow {
  studentId: string;
  enrollmentId: string | null;
  studentName: string;
  existingScore: number | null;
  existingResultId: string | null;
}

interface Props {
  assessment: Assessment;
  students: StudentRow[];
}

export function BulkGradeForm({ assessment, students }: Props) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(
      students.map((s) => [s.studentId, s.existingScore != null ? String(s.existingScore) : ""])
    )
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const grades = students
      .filter((s) => scores[s.studentId] !== "")
      .map((s) => ({
        studentId: s.studentId,
        enrollmentId: s.enrollmentId ?? undefined,
        score: Number(scores[s.studentId]),
        status: "GRADED" as const,
      }));

    if (grades.length === 0) {
      toast.error("Introduza pelo menos uma nota.");
      return;
    }

    setLoading(true);
    const res = await bulkGradeAssessmentAction({
      assessmentId: assessment.id,
      grades,
    });
    setLoading(false);

    if (res.success) {
      toast.success("Notas guardadas com sucesso.");
      router.push(`/assessments/${assessment.id}`);
    } else {
      toast.error(res.error ?? "Erro ao guardar notas.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Nota máxima: <span className="font-semibold text-foreground">{assessment.maxScore}</span>
      </div>

      {students.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-muted-foreground">
          Nenhum aluno encontrado para esta avaliação. Associe uma turma primeiro.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aluno</TableHead>
                <TableHead className="w-50">
                  Nota (máx. {assessment.maxScore})
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((s) => (
                <TableRow key={s.studentId}>
                  <TableCell className="font-medium">{s.studentName}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={assessment.maxScore}
                      step={0.5}
                      value={scores[s.studentId] ?? ""}
                      onChange={(e) =>
                        setScores((prev) => ({ ...prev, [s.studentId]: e.target.value }))
                      }
                      placeholder="—"
                      className="w-28"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || students.length === 0}>
          {loading ? "A guardar..." : "Guardar Notas"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/assessments/${assessment.id}`)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
