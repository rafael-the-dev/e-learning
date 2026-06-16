import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getAccountsReceivableReport } from "@/modules/reports/finance/services/financial-reports.service";
import type { AccountsReceivableFilters } from "@/modules/reports/finance/types";

export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.FINANCIAL_REPORTS_VIEW);
    const { searchParams } = req.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)));

    const filters: AccountsReceivableFilters = {
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
      dueDateFrom: searchParams.get("dueDateFrom") ?? undefined,
      dueDateTo: searchParams.get("dueDateTo") ?? undefined,
      invoiceStatus: searchParams.get("invoiceStatus") ?? undefined,
      agingBucket: (searchParams.get("agingBucket") as AccountsReceivableFilters["agingBucket"]) ?? undefined,
      search: searchParams.get("search") ?? undefined,
    };

    const report = await getAccountsReceivableReport(filters);

    await auditService.log(context, {
      entity: "FinancialReport",
      entityId: "accounts-receivable",
      action: "financial_report.viewed",
      newValues: {
        reportType: "accounts-receivable",
        filters: { branchId: filters.branchId, courseId: filters.courseId, page, pageSize },
      },
    });

    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
