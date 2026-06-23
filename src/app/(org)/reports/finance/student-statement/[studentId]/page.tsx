import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Download } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Button } from "@/shared/components/ui/button";
import { requirePermissionOrRedirect } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getStudentFinancialStatement } from "@/modules/reports/finance/services/financial-reports.service";
import { StudentStatementView } from "@/modules/reports/finance/components/student-statement-view";
import { IntegrityWarningBanner } from "@/modules/reports/finance/components/integrity-warning-banner";
import { getDb } from "@/server/db";

export async function generateMetadata({ params }: { params: { studentId: string } }) {
  return { title: "Extrato Financeiro" };
}

async function getCriticalCount(organizationId: string) {
  const db = await getDb();
  return db.financialIntegrityIssue.count({
    where: { organizationId, severity: "CRITICAL", status: "OPEN" },
  });
}

export default async function StudentStatementPage({
  params,
  searchParams,
}: {
  params: { studentId: string };
  searchParams: Record<string, string | undefined>;
}) {
  const context = await requirePermissionOrRedirect(PERMISSIONS.FINANCIAL_REPORTS_STUDENT_STATEMENT);
  const { studentId } = params;

  const [statement, criticalCount] = await Promise.all([
    getStudentFinancialStatement({
      organizationId: context.organizationId,
      studentId,
      dateFrom: searchParams.dateFrom,
      dateTo: searchParams.dateTo,
    }),
    getCriticalCount(context.organizationId),
  ]);

  if (!statement) notFound();

  await auditService.log(context, {
    entity: "StudentFinancialStatement",
    entityId: studentId,
    action: "student_statement.viewed",
    newValues: { studentId, studentName: statement.student.studentName },
  });

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={`Extrato — ${statement.student.studentName}`}
        description={statement.student.studentCode ? `Código: ${statement.student.studentCode}` : undefined}
        breadcrumb={
          <div className="flex items-center gap-1 text-muted-foreground text-xs">
            <Link href="/reports/finance" className="hover:text-foreground flex items-center gap-1">
              <ChevronLeft className="size-3" /> Relatórios
            </Link>
            <span>/</span>
            <Link href="/reports/finance/student-statement" className="hover:text-foreground">Extrato do Aluno</Link>
          </div>
        }
        actions={
          <div className="flex gap-2">
            {/* Date filters */}
            <form method="GET" className="flex items-center gap-2">
              <input type="date" name="dateFrom" defaultValue={searchParams.dateFrom ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
              <span className="text-xs text-muted-foreground">até</span>
              <input type="date" name="dateTo" defaultValue={searchParams.dateTo ?? ""} className="h-8 rounded-md border border-input bg-background px-2 text-xs" />
              <Button type="submit" size="sm" variant="outline">Filtrar</Button>
            </form>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/reports/finance/student-statement/${studentId}?format=json`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="size-4 mr-2" />
                Exportar
              </a>
            </Button>
          </div>
        }
      />
      <div className="p-8 space-y-6">
        <IntegrityWarningBanner criticalCount={criticalCount} />
        <StudentStatementView statement={statement} />
      </div>
    </div>
  );
}
