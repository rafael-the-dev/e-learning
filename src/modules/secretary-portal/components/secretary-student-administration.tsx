import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { UserCog, UserPlus, CheckCircle2 } from "lucide-react";
import type { SecretaryStudentAdministration } from "@/modules/secretary-portal/types";

interface Props {
  administration: SecretaryStudentAdministration;
}

interface MetricProps {
  label: string;
  count: number;
  href: string;
}

function HygieneMetric({ label, count, href }: MetricProps) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:bg-muted/50"
    >
      <span className="text-sm">{label}</span>
      <Badge variant={count > 0 ? "warning" : "secondary"}>{count}</Badge>
    </Link>
  );
}

export function SecretaryStudentAdministration({ administration }: Props) {
  const allClear =
    administration.withoutPortalAccount === 0 &&
    administration.missingEmail === 0 &&
    administration.inactiveWithActiveEnrollment === 0 &&
    administration.enrollmentWithoutClassGroup === 0 &&
    administration.enrollmentWithoutLevel === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <UserCog className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Administração de Alunos</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {allClear ? (
          <EmptyState
            icon={<CheckCircle2 className="size-8" />}
            title="Sem irregularidades de dados."
            description="Todos os registos de alunos e matrículas estão em conformidade."
            className="border-0"
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <HygieneMetric label="Sem conta no portal" count={administration.withoutPortalAccount} href="/students" />
            <HygieneMetric label="Sem email" count={administration.missingEmail} href="/students" />
            <HygieneMetric
              label="Inactivos com matrícula activa"
              count={administration.inactiveWithActiveEnrollment}
              href="/students"
            />
            <HygieneMetric
              label="Matrícula sem turma"
              count={administration.enrollmentWithoutClassGroup}
              href="/enrollments"
            />
            <HygieneMetric
              label="Matrícula sem nível actual"
              count={administration.enrollmentWithoutLevel}
              href="/enrollments"
            />
          </div>
        )}

        {administration.studentsWithoutPortalAccount.length > 0 && (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <UserPlus className="size-3.5" />
              Alunos sem conta no portal
            </p>
            <ul className="divide-y">
              {administration.studentsWithoutPortalAccount.map((s) => (
                <li key={s.studentId} className="flex items-center gap-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.studentName}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email ?? "Sem email"}</p>
                  </div>
                  <Link
                    href={`/students/${s.studentId}`}
                    className="text-xs font-medium text-primary hover:underline shrink-0"
                  >
                    Gerir conta
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
