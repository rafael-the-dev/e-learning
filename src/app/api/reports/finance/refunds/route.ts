import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getRefundsReport } from "@/modules/reports/finance/services/financial-reports.service";
import type { RefundsReportFilters } from "@/modules/reports/finance/types";

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: RefundsReportFilters = {
      organizationId: context.organizationId,
      page,
      pageSize,
      branchId: searchParams.get("branchId") ?? undefined,
      courseId: searchParams.get("courseId") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      academicTermId: searchParams.get("academicTermId") ?? undefined,
      classGroupId: searchParams.get("classGroupId") ?? undefined,
      dateFrom: searchParams.get("dateFrom") ?? undefined,
      dateTo: searchParams.get("dateTo") ?? undefined,
      refundMethod: searchParams.get("refundMethod") ?? undefined,
      refundStatus: searchParams.get("refundStatus") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    };

    const report = await getRefundsReport(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "refunds",
      action: "financial_report.viewed",
      newValues: { reportType: "refunds", filters: { page, pageSize } },
    });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
