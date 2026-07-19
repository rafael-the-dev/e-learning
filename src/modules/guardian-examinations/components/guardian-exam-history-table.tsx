import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { ExaminationEmptyState } from "@/modules/examinations/components/examination-states";
import type { GuardianExamHistoryPageDto } from "@/modules/guardian-examinations/types";
import { GuardianExamHistoryPager } from "./guardian-exam-history-pager";
import {
  CandidateStatusBadge,
  AttendanceStatusBadge,
  ResultCodeBadge,
  AppealStatusBadge,
  formatExamDate,
} from "./guardian-exam-status-labels";

// =============================================================================
// GuardianExamHistoryTable — supervision exam history (READ-ONLY)
// -----------------------------------------------------------------------------
// Candidacy-based history for ONE linked student, so it includes exams with no
// published result, absences and withdrawals. Server-rendered; only the pager is
// a client component. The Presença column is rendered ONLY when attendanceVisible
// (the link's canViewAttendance). Results are PUBLISHED-only (backend masks) and
// labelled as a percentage; appeals are status-only. Every row drills through to
// the exam detail — no dead ends. No write actions anywhere.
// =============================================================================

export function GuardianExamHistoryTable({
  page,
  filtered,
}: {
  page: GuardianExamHistoryPageDto;
  /** True when any of year/subjectId/status is set — distinguishes "no match" from
   *  "no history at all" in the empty state. */
  filtered: boolean;
}) {
  const showAttendance = page.attendanceVisible;

  if (page.items.length === 0) {
    return filtered ? (
      <ExaminationEmptyState
        title="Nenhum exame corresponde aos filtros."
        description="Ajuste ou limpe os filtros para ver mais resultados."
      />
    ) : (
      <ExaminationEmptyState
        title="Sem histórico de exames para este educando."
        description="O histórico de exames aparecerá aqui à medida que o educando for inscrito e realizar exames."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Disciplina</TableHead>
              <TableHead>Sessão</TableHead>
              {showAttendance && <TableHead>Presença</TableHead>}
              <TableHead>Estado</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Recurso</TableHead>
              <TableHead className="w-1 text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.items.map((item) => (
              <TableRow key={item.examCandidateId}>
                <TableCell>{formatExamDate(item.sessionDate)}</TableCell>
                <TableCell className="font-medium">{item.subjectName ?? "—"}</TableCell>
                <TableCell>{item.sessionTitle}</TableCell>
                {showAttendance && (
                  <TableCell>
                    {item.attendanceStatus ? (
                      <AttendanceStatusBadge status={item.attendanceStatus} />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                <TableCell>
                  <CandidateStatusBadge status={item.candidateStatus} />
                </TableCell>
                <TableCell className="tabular-nums">
                  {item.result && item.result.normalizedScore != null
                    ? `${item.result.normalizedScore}%`
                    : "Sem resultado"}
                </TableCell>
                <TableCell>
                  {item.result ? <ResultCodeBadge status={item.result.resultCode} /> : "—"}
                </TableCell>
                <TableCell>
                  {item.appealStatus ? <AppealStatusBadge status={item.appealStatus} /> : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/guardian/examinations/${item.examCandidateId}`}>Ver</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <GuardianExamHistoryPager page={page.page} pageSize={page.pageSize} total={page.total} />
    </div>
  );
}
