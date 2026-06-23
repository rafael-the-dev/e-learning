import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getStudentFinancialStatement } from "@/modules/reports/finance/services/financial-reports.service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_STUDENT_STATEMENT);
    const { searchParams } = req.nextUrl;
    const { studentId } = await params;

    const statement = await getStudentFinancialStatement({
      organizationId: context.organizationId,
      studentId,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    });

    if (!statement) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 });
    }

    await auditService.log(context, {
      entity: "StudentFinancialStatement",
      entityId: studentId,
      action: "student_statement.viewed",
      newValues: { studentId, reportType: "student-statement" },
    });

    return NextResponse.json(statement);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
