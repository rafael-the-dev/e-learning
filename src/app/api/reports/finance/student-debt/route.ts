import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getStudentDebtReport } from "@/modules/reports/finance/services/financial-reports.service";
import type { StudentDebtFilters } from "@/modules/reports/finance/types";

export async function GET(req: NextRequest) {
  let context: Awaited<ReturnType<typeof requirePermission>>;
  try {
    context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: StudentDebtFilters = {
      organizationId: context.organizationId,
      page,
      pageSize,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
      dueDateTo: searchParams.get("dueDateTo") ?? undefined,
      overdueOnly: searchParams.get("overdueOnly") === "true",
      minBalance: searchParams.get("minBalance") ? parseFloat(searchParams.get("minBalance")!) : undefined,
      search: searchParams.get("search") ?? undefined,
    };

    const report = await getStudentDebtReport(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "student-debt",
      action: "financial_report.viewed",
      newValues: { reportType: "student-debt", filters: { branchId: filters.branchId, courseId: filters.courseId, page, pageSize } },
    });

    return NextResponse.json(report);
  } catch (err) {
    console.error("[student-debt] route error:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
