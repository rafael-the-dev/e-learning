import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import type { GuardianExamOverviewDto } from "@/modules/guardian-examinations/types";
import { formatExamDate, formatExamTime } from "./guardian-exam-status-labels";

// =============================================================================
// GUARDIAN EXAM SUMMARY CARD — compact card for the /guardian dashboard
// -----------------------------------------------------------------------------
// A one-line "próximo exame" per academically-visible linked student, plus a link
// into the full supervision portal. READ-ONLY: the only interactive element is the
// navigation link to /guardian/examinations.
// =============================================================================

export function GuardianExamSummaryCard({ overview }: { overview: GuardianExamOverviewDto }) {
  // Only students with academic visibility that have a scheduled next exam.
  const upcoming = overview.students
    .filter((s) => s.academicVisible && s.nextExam)
    .sort(
      (a, b) =>
        new Date(a.nextExam!.startsAt).getTime() - new Date(b.nextExam!.startsAt).getTime()
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Exames</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem exames agendados.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((summary) => {
              const exam = summary.nextExam!;
              return (
                <li key={summary.student.studentId} className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {summary.student.studentName} · {exam.subjectName ?? "Exame"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatExamDate(exam.startsAt)} · {formatExamTime(exam.startsAt)}
                    {exam.roomName ? ` · ${exam.roomName}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/guardian/examinations"
          className="inline-flex items-center gap-1 border-t pt-3 text-sm font-medium text-primary hover:underline"
        >
          Ver exames <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
