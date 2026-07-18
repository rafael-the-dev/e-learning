import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type { TeacherExamCandidateRowDto } from "@/modules/teacher-examinations/types";
import {
  CandidateStatusBadge,
  AttendanceStatusBadge,
  ResultStatusBadge,
  getTeacherExamStatusLabel,
} from "./teacher-exam-status-labels";

// Read-only candidates table for the session detail (Sprint 1 = no mutations).
// "Percentagem" is the normalized exam score — never a final subject grade.

export function TeacherCandidatesTable({ candidates }: { candidates: TeacherExamCandidateRowDto[] }) {
  if (candidates.length === 0) {
    return (
      <ExaminationEmptyState
        title="Sem candidatos."
        description="Ainda não há candidatos inscritos nesta sessão de exame."
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Nº</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Presença</TableHead>
            <TableHead>Resultado</TableHead>
            <TableHead className="text-right">Percentagem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((candidate) => (
            <TableRow key={candidate.examCandidateId}>
              <TableCell className="font-medium">{candidate.studentName ?? "—"}</TableCell>
              <TableCell>{candidate.studentNumber ?? "—"}</TableCell>
              <TableCell>
                <CandidateStatusBadge status={candidate.candidateStatus} />
              </TableCell>
              <TableCell>
                <AttendanceStatusBadge status={candidate.attendanceStatus} />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <ResultStatusBadge status={candidate.resultStatus} />
                  {candidate.resultCode && (
                    <span className="text-xs text-muted-foreground">
                      {getTeacherExamStatusLabel("resultCode", candidate.resultCode)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {candidate.normalizedScore != null ? `${candidate.normalizedScore}%` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
