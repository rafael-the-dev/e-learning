import Link from "next/link";
import { Card, CardContent } from "@/shared/components/ui/card";
import { BookOpen, Activity, CircleDollarSign, ChevronRight } from "lucide-react";
import type { StudentAcademicSummary } from "@/modules/students/services/student-academic-summary.service";
import type { StudentRiskSummary, RiskDimension } from "@/modules/students/services/student-risk.service";
import type { StudentAttendanceSummary } from "@/modules/attendance/types";
import type { Student360FinanceSection } from "@/modules/students/student-360/services/student-360.service";

// The operational summary (H7): a few purposeful cards, each answering — what's the state,
// what's the main problem, what's the next action (via its link). Every domain metric
// (média / assiduidade / dívida) appears ONCE, here — not also in a KPI band.
//
// F-M6: each card is omitted entirely when its dimension is not authorized — a null summary
// (academic/attendance) or an unauthorized finance section. No empty/nulled placeholder is
// rendered, so the card's absence carries the authorization state (matching the DTO).

function attentionLine(dimension: RiskDimension | null): { text: string; alert: boolean } {
  const count = dimension?.reasons.length ?? 0;
  if (count === 0) return { text: "Sem problemas registados", alert: false };
  return { text: `${count} ${count === 1 ? "item exige" : "itens exigem"} atenção`, alert: true };
}

function OperationalCard({
  icon,
  title,
  value,
  attention,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  attention: { text: string; alert: boolean };
  href: string;
}) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="py-4">
        <Link href={href} className="flex items-start justify-between gap-2 group">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {icon}
              {title}
            </div>
            <p className="text-lg font-semibold tabular-nums">{value}</p>
            <p className={attention.alert ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {attention.text}
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
        </Link>
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-PT", { style: "currency", currency: "MZN" });
}

export function StudentOperationalCards({
  academicSummary,
  attendanceSummary,
  riskSummary,
  finance,
}: {
  academicSummary: StudentAcademicSummary | null;
  attendanceSummary: StudentAttendanceSummary | null;
  riskSummary: StudentRiskSummary;
  finance: Student360FinanceSection | null;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Académico disappears entirely without GRADES_VIEW (academic summary not authorized). */}
      {academicSummary && (
        <OperationalCard
          icon={<BookOpen className="size-3.5" />}
          title="Académico"
          value={
            academicSummary.subjectAverage != null
              ? `Média ${academicSummary.subjectAverage.toFixed(1)}`
              : "Sem notas"
          }
          attention={attentionLine(riskSummary.academic)}
          href="?tab=grades"
        />
      )}
      {/* Assiduidade disappears entirely without ATTENDANCE_SESSIONS_VIEW. */}
      {attendanceSummary && (
        <OperationalCard
          icon={<Activity className="size-3.5" />}
          title="Assiduidade"
          value={
            attendanceSummary.attendancePercentage != null
              ? `${attendanceSummary.attendancePercentage.toFixed(1)}%`
              : "Sem dados"
          }
          attention={attentionLine(riskSummary.attendance)}
          href="?tab=attendance"
        />
      )}
      {/* Financeiro disappears entirely without permission (billing not authorized). */}
      {finance?.billing && (
        <OperationalCard
          icon={<CircleDollarSign className="size-3.5" />}
          title="Financeiro"
          value={`Dívida ${formatCurrency(finance.billing.outstandingBalance)}`}
          attention={attentionLine(riskSummary.financial)}
          href="?tab=finance"
        />
      )}
    </div>
  );
}
