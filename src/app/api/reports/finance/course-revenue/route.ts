import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getCourseRevenueReport } from "@/modules/reports/finance/services/financial-reports.service";
import type { CourseRevenueFilters } from "@/modules/reports/finance/types";

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const filters: CourseRevenueFilters = {
      organizationId: context.organizationId,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
    };

    const report = await getCourseRevenueReport(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "course-revenue",
      action: "financial_report.viewed",
      newValues: { reportType: "course-revenue" },
    });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
