"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "@/shared/hooks/use-toast";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
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
  canEnterGrades: boolean;
  isGraded: boolean;
  isLocked: boolean;
  canReopen: boolean;
}

export function BulkGradeForm({
  assessment,
  students,
  canEnterGrades,
  isGraded,
  isLocked,
  canReopen,
}: Props) {
  const router = useRouter();

  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      students.map((s) => [
        s.studentId,
        s.existingScore != null ? String(s.existingScore) : "",
      ])
    )
  );
  const [editReason, setEditReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isGraded && !editReason.trim()) {
      toast.error("Indique o motivo da reclassificação.");
      return;
    }

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
      ...(isGraded ? { editReason: editReason.trim() } : {}),
    });
    setLoading(false);

    if (res.success) {
      toast.success(isGraded ? "Notas atualizadas com sucesso." : "Notas guardadas com sucesso.");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao guardar notas.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground">
          Nota máxima:{" "}
          <span className="font-semibold text-foreground">{assessment.maxScore}</span>
        </div>
        {isLocked && (
          <Badge variant="destructive" className="gap-1">
            <Lock className="size-3" />
            Bloqueada
          </Badge>
        )}
        {isGraded && !isLocked && (
          <Badge variant="secondary">Classificada</Badge>
        )}
      </div>

      {/* Locked notice */}
      {isLocked && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {canReopen
            ? "Esta avaliação está bloqueada. Pode desbloqueá-la na página de detalhes da avaliação."
            : "Esta avaliação está bloqueada e não pode ser editada. Contacte um administrador para desbloquear."}
        </div>
      )}

      {students.length === 0 ? (
        <div className="rounded-md border p-12 text-center text-muted-foreground">
          Nenhum aluno encontrado para esta avaliação. Associe uma turma primeiro.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aluno</TableHead>
                  <TableHead className="w-44">
                    Nota (máx. {assessment.maxScore})
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.studentId}>
                    <TableCell className="font-medium">{s.studentName}</TableCell>
                    <TableCell>
                      {canEnterGrades && !isLocked ? (
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
                      ) : (
                        <span className="tabular-nums">
                          {s.existingScore != null
                            ? s.existingScore
                            : <span className="text-muted-foreground">—</span>}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Reason — required when re-grading */}
          {canEnterGrades && !isLocked && isGraded && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-reason">
                Motivo da reclassificação <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="edit-reason"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Descreva o motivo da alteração das notas…"
                rows={2}
                className="resize-none"
              />
            </div>
          )}

          {canEnterGrades && !isLocked && (
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={loading || (isGraded && !editReason.trim())}
              >
                {loading
                  ? "A guardar..."
                  : isGraded
                  ? "Guardar Alterações"
                  : "Guardar Notas"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => router.push(`/assessments/${assessment.id}`)}
              >
                Cancelar
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
