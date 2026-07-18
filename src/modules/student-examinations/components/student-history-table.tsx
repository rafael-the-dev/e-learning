import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type { StudentExamHistoryPageDto } from "@/modules/student-examinations/types";
import { StudentHistoryPager } from "./student-history-pager";
import {
  CandidateStatusBadge,
  AttendanceStatusBadge,
  formatExamDate,
} from "./student-exam-status-labels";

// Candidacy-based exam history — includes exams with no published result. The
// result column shows the normalized percentage (never a final grade). Rows are
// server-rendered; only the pager is a client component.

export function StudentHistoryTable({ page }: { page: StudentExamHistoryPageDto }) {
  if (page.items.length === 0) {
    return <ExaminationEmptyState title="Sem exames no histórico." />;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Disciplina</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Sala</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Presença</TableHead>
              <TableHead>Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((item) => (
              <TableRow key={item.examCandidateId}>
                <TableCell className="font-medium">{item.subjectName ?? "—"}</TableCell>
                <TableCell>{formatExamDate(item.sessionDate)}</TableCell>
                <TableCell>{item.roomName ?? "—"}</TableCell>
                <TableCell>
                  <CandidateStatusBadge status={item.candidateStatus} />
                </TableCell>
                <TableCell>
                  {item.attendanceStatus ? (
                    <AttendanceStatusBadge status={item.attendanceStatus} />
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {item.result && item.result.normalizedScore != null
                    ? `${item.result.normalizedScore}%`
                    : "Sem resultado"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <StudentHistoryPager page={page.page} pageSize={page.pageSize} total={page.total} />
    </div>
  );
}
