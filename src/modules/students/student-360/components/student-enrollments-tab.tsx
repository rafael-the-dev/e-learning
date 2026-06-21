import Link from "next/link";
import { Card, CardContent } from "@/shared/components/ui/card";
import { StatusBadge } from "@/shared/components/data/status-badge";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { FINANCIAL_STATUS_LABELS } from "@/modules/enrollments/types";
import { GraduationCap, ArrowRight } from "lucide-react";
import type { Enrollment } from "@/modules/enrollments/types";

export function StudentEnrollmentsTab({ enrollments }: { enrollments: Enrollment[] }) {
  if (enrollments.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="size-8" />}
        title="Sem matrículas"
        description="Este aluno ainda não tem matrículas registadas."
      />
    );
  }

  return (
    <div className="space-y-3">
      {enrollments.map((enrollment) => (
        <Card key={enrollment.id}>
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{enrollment.courseName}</span>
                {enrollment.enrollmentNumber && (
                  <span className="text-xs text-muted-foreground font-mono">
                    #{enrollment.enrollmentNumber}
                  </span>
                )}
                <StatusBadge status={enrollment.status} />
                {enrollment.financialStatus && (
                  <Badge variant="outline" className="text-xs">
                    {FINANCIAL_STATUS_LABELS[enrollment.financialStatus] ?? enrollment.financialStatus}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {enrollment.courseLevelName ?? "—"}
                {enrollment.classGroupName ? ` · ${enrollment.classGroupName}` : ""}
                {" · "}
                {enrollment.academicYearName}
                {enrollment.academicTermName ? ` (${enrollment.academicTermName})` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Início: {enrollment.startDate ? new Date(enrollment.startDate).toLocaleDateString("pt-PT") : "—"}
                {enrollment.expectedEndDate
                  ? ` · Previsão de fim: ${new Date(enrollment.expectedEndDate).toLocaleDateString("pt-PT")}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button asChild variant="outline" size="sm">
                <Link href={`/enrollments/${enrollment.id}`}>
                  Ver Matrícula
                  <ArrowRight className="size-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
